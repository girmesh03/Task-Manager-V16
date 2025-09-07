// User.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import bcrypt from "bcrypt";
import { validator } from "express-validator";
import { UserRole } from "../utils/constants.js";

const profilePictureSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      validate: {
        validator: (v) =>
          !v ||
          validator.isURL(v, {
            protocols: ["http", "https"],
            require_protocol: true,
          }),
        message: "Profile picture URL must be a valid HTTP or HTTPS URL",
      },
    },
    publicId: String,
  },
  { _id: false }
);

/**
 * @typedef {Object} User
 * @property {string} firstName - User's first name
 * @property {string} lastName - User's last name
 * @property {string} position - User's position in the department
 * @property {string} role - User's role (SuperAdmin, Admin, Manager, User)
 * @property {string} email - User's email address
 * @property {string} password - User's hashed password
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Object} profilePicture - User's profile picture URL and public ID
 * @property {string[]} skills - Array of user's skills
 * @property {Date} createdAt - Timestamp when the user was created
 * @property {Date} updatedAt - Timestamp when the user was last updated
 */
const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [50, "First name cannot exceed 50 characters"],
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [50, "Last name cannot exceed 50 characters"],
    },
    position: {
      type: String,
      required: [true, "Position is required"],
      trim: true,
      maxlength: [50, "Position cannot exceed 50 characters"],
    },
    role: {
      type: String,
      enum: {
        values: UserRole,
        message: "Role must be SuperAdmin, Admin, Manager, or User",
      },
      default: "User",
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: "Please provide a valid email address",
      },
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Department reference is required"],
    },
    isDeleted: { type: Boolean, default: false },
    profilePicture: profilePictureSchema,
    skills: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Skill cannot exceed 50 characters"],
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.id;
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.id;
        delete ret.password;
        return ret;
      },
    },
  }
);

// Tenant consistency: department must belong to organization
userSchema.pre("validate", async function (next) {
  try {
    const dept = await mongoose
      .model("Department")
      .findById(this.department)
      .select("organization")
      .lean();
    if (!dept) return next(new Error("Department not found"));
    if (String(dept.organization) !== String(this.organization)) {
      return next(
        new Error(
          "User.department must belong to the same organization as the user"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Indexes
userSchema.index(
  {
    organization: 1,
    email: 1,
  },
  {
    unique: true,
  }
);

userSchema.index(
  { department: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: { $in: ["SuperAdmin", "Admin"] },
      isDeleted: false,
    },
  }
);

// Virtuals
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Minimal formatting before save
userSchema.pre("save", function (next) {
  if (this.isModified("firstName") && this.firstName)
    this.firstName = this.firstName.trim();
  if (this.isModified("lastName") && this.lastName)
    this.lastName = this.lastName.trim();
  if (this.isModified("position") && this.position)
    this.position = this.position.trim();
  next();
});

// Password hashing
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(new Error("Password hashing failed"));
  }
});

// Password matching method
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) {
    throw new Error(
      "Password hash not selected. Query the user with '+password' to compare."
    );
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

// Cascade soft-delete for user with deep cleanup
userSchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      // 1) Soft delete tasks created by the user
      const tasks = await mongoose
        .model("BaseTask")
        .find(
          { createdBy: this._id, isDeleted: false },
          { _id: 1, taskType: 1 },
          { session }
        )
        .lean();

      const taskIds = tasks.map((t) => t._id);
      if (taskIds.length) {
        await mongoose
          .model("BaseTask")
          .updateMany(
            { _id: { $in: taskIds }, isDeleted: false },
            { $set: { isDeleted: true } },
            { session }
          );

        // Cascades similar to BaseTask pre-save (explicit due to query updates)
        // Task attachments
        const taskAttachmentIds = await mongoose
          .model("Attachment")
          .find(
            {
              parent: { $in: taskIds },
              parentModel: {
                $in: ["RoutineTask", "AssignedTask", "ProjectTask"],
              },
              isDeleted: false,
            },
            { _id: 1 },
            { session }
          )
          .lean()
          .then((rows) => rows.map((r) => r._id));

        if (taskAttachmentIds.length) {
          await mongoose
            .model("Attachment")
            .updateMany(
              { _id: { $in: taskAttachmentIds } },
              { $set: { isDeleted: true } },
              { session }
            );
        }

        await mongoose.model("Notification").updateMany(
          {
            entity: { $in: taskIds },
            entityModel: {
              $in: ["RoutineTask", "AssignedTask", "ProjectTask"],
            },
            isDeleted: false,
          },
          { $set: { isDeleted: true } },
          { session }
        );

        // Comments under tasks
        const taskCommentIds = await mongoose
          .model("TaskComment")
          .find(
            {
              parent: { $in: taskIds },
              parentModel: {
                $in: ["RoutineTask", "AssignedTask", "ProjectTask"],
              },
              isDeleted: false,
            },
            { _id: 1 },
            { session }
          )
          .lean()
          .then((rows) => rows.map((r) => r._id));

        if (taskCommentIds.length) {
          await mongoose
            .model("TaskComment")
            .updateMany(
              { _id: { $in: taskCommentIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          const tcAttachIds = await mongoose
            .model("Attachment")
            .find(
              {
                parentModel: "TaskComment",
                parent: { $in: taskCommentIds },
                isDeleted: false,
              },
              { _id: 1 },
              { session }
            )
            .lean()
            .then((rows) => rows.map((r) => r._id));

          if (tcAttachIds.length) {
            await mongoose
              .model("Attachment")
              .updateMany(
                { _id: { $in: tcAttachIds } },
                { $set: { isDeleted: true } },
                { session }
              );

            await mongoose
              .model("TaskComment")
              .updateMany(
                { _id: { $in: taskCommentIds } },
                { $pull: { attachments: { $in: tcAttachIds } } },
                { session }
              );
          }

          await mongoose.model("Notification").updateMany(
            {
              entityModel: "TaskComment",
              entity: { $in: taskCommentIds },
              isDeleted: false,
            },
            { $set: { isDeleted: true } },
            { session }
          );
        }

        // Activities under Assigned/Project tasks
        const isAP = (t) =>
          t.taskType === "AssignedTask" || t.taskType === "ProjectTask";
        const apTaskIds = tasks.filter(isAP).map((t) => t._id);
        if (apTaskIds.length) {
          const activityIds = await mongoose
            .model("TaskActivity")
            .find(
              {
                task: { $in: apTaskIds },
                taskModel: { $in: ["AssignedTask", "ProjectTask"] },
                isDeleted: false,
              },
              { _id: 1 },
              { session }
            )
            .lean()
            .then((rows) => rows.map((r) => r._id));

          if (activityIds.length) {
            await mongoose
              .model("TaskActivity")
              .updateMany(
                { _id: { $in: activityIds } },
                { $set: { isDeleted: true } },
                { session }
              );

            const actAttachIds = await mongoose
              .model("Attachment")
              .find(
                {
                  parentModel: "TaskActivity",
                  parent: { $in: activityIds },
                  isDeleted: false,
                },
                { _id: 1 },
                { session }
              )
              .lean()
              .then((rows) => rows.map((r) => r._id));

            if (actAttachIds.length) {
              await mongoose
                .model("Attachment")
                .updateMany(
                  { _id: { $in: actAttachIds } },
                  { $set: { isDeleted: true } },
                  { session }
                );

              await mongoose
                .model("TaskActivity")
                .updateMany(
                  { _id: { $in: activityIds } },
                  { $pull: { attachments: { $in: actAttachIds } } },
                  { session }
                );
            }

            await mongoose.model("Notification").updateMany(
              {
                entityModel: "TaskActivity",
                entity: { $in: activityIds },
                isDeleted: false,
              },
              { $set: { isDeleted: true } },
              { session }
            );

            // Comments under those activities
            const activityCommentIds = await mongoose
              .model("TaskComment")
              .find(
                {
                  parentModel: "TaskActivity",
                  parent: { $in: activityIds },
                  isDeleted: false,
                },
                { _id: 1 },
                { session }
              )
              .lean()
              .then((rows) => rows.map((r) => r._id));

            if (activityCommentIds.length) {
              await mongoose
                .model("TaskComment")
                .updateMany(
                  { _id: { $in: activityCommentIds } },
                  { $set: { isDeleted: true } },
                  { session }
                );

              const acAttachIds = await mongoose
                .model("Attachment")
                .find(
                  {
                    parentModel: "TaskComment",
                    parent: { $in: activityCommentIds },
                    isDeleted: false,
                  },
                  { _id: 1 },
                  { session }
                )
                .lean()
                .then((rows) => rows.map((r) => r._id));

              if (acAttachIds.length) {
                await mongoose
                  .model("Attachment")
                  .updateMany(
                    { _id: { $in: acAttachIds } },
                    { $set: { isDeleted: true } },
                    { session }
                  );

                await mongoose
                  .model("TaskComment")
                  .updateMany(
                    { _id: { $in: activityCommentIds } },
                    { $pull: { attachments: { $in: acAttachIds } } },
                    { session }
                  );
              }

              await mongoose.model("Notification").updateMany(
                {
                  entityModel: "TaskComment",
                  entity: { $in: activityCommentIds },
                  isDeleted: false,
                },
                { $set: { isDeleted: true } },
                { session }
              );
            }
          }
        }
      }

      // 2) Soft delete task activities created by the user (independent of tasks above)
      const userActivityIds = await mongoose
        .model("TaskActivity")
        .find(
          { createdBy: this._id, isDeleted: false },
          { _id: 1 },
          { session }
        )
        .lean()
        .then((rows) => rows.map((r) => r._id));

      if (userActivityIds.length) {
        await mongoose
          .model("TaskActivity")
          .updateMany(
            { _id: { $in: userActivityIds } },
            { $set: { isDeleted: true } },
            { session }
          );

        const uaAttachIds = await mongoose
          .model("Attachment")
          .find(
            {
              parentModel: "TaskActivity",
              parent: { $in: userActivityIds },
              isDeleted: false,
            },
            { _id: 1 },
            { session }
          )
          .lean()
          .then((rows) => rows.map((r) => r._id));

        if (uaAttachIds.length) {
          await mongoose
            .model("Attachment")
            .updateMany(
              { _id: { $in: uaAttachIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          await mongoose
            .model("TaskActivity")
            .updateMany(
              { _id: { $in: userActivityIds } },
              { $pull: { attachments: { $in: uaAttachIds } } },
              { session }
            );
        }

        await mongoose.model("Notification").updateMany(
          {
            entityModel: "TaskActivity",
            entity: { $in: userActivityIds },
            isDeleted: false,
          },
          { $set: { isDeleted: true } },
          { session }
        );

        // Comments under these activities
        const uaCommentIds = await mongoose
          .model("TaskComment")
          .find(
            {
              parentModel: "TaskActivity",
              parent: { $in: userActivityIds },
              isDeleted: false,
            },
            { _id: 1 },
            { session }
          )
          .lean()
          .then((rows) => rows.map((r) => r._id));

        if (uaCommentIds.length) {
          await mongoose
            .model("TaskComment")
            .updateMany(
              { _id: { $in: uaCommentIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          const uacAttachIds = await mongoose
            .model("Attachment")
            .find(
              {
                parentModel: "TaskComment",
                parent: { $in: uaCommentIds },
                isDeleted: false,
              },
              { _id: 1 },
              { session }
            )
            .lean()
            .then((rows) => rows.map((r) => r._id));

          if (uacAttachIds.length) {
            await mongoose
              .model("Attachment")
              .updateMany(
                { _id: { $in: uacAttachIds } },
                { $set: { isDeleted: true } },
                { session }
              );

            await mongoose
              .model("TaskComment")
              .updateMany(
                { _id: { $in: uaCommentIds } },
                { $pull: { attachments: { $in: uacAttachIds } } },
                { session }
              );
          }

          await mongoose.model("Notification").updateMany(
            {
              entityModel: "TaskComment",
              entity: { $in: uaCommentIds },
              isDeleted: false,
            },
            { $set: { isDeleted: true } },
            { session }
          );
        }
      }

      // 3) Soft delete task comments created by the user (independent)
      const userCommentIds = await mongoose
        .model("TaskComment")
        .find(
          { createdBy: this._id, isDeleted: false },
          { _id: 1 },
          { session }
        )
        .lean()
        .then((rows) => rows.map((r) => r._id));

      if (userCommentIds.length) {
        await mongoose
          .model("TaskComment")
          .updateMany(
            { _id: { $in: userCommentIds } },
            { $set: { isDeleted: true } },
            { session }
          );

        const ucAttachIds = await mongoose
          .model("Attachment")
          .find(
            {
              parentModel: "TaskComment",
              parent: { $in: userCommentIds },
              isDeleted: false,
            },
            { _id: 1 },
            { session }
          )
          .lean()
          .then((rows) => rows.map((r) => r._id));

        if (ucAttachIds.length) {
          await mongoose
            .model("Attachment")
            .updateMany(
              { _id: { $in: ucAttachIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          await mongoose
            .model("TaskComment")
            .updateMany(
              { _id: { $in: userCommentIds } },
              { $pull: { attachments: { $in: ucAttachIds } } },
              { session }
            );
        }

        await mongoose.model("Notification").updateMany(
          {
            entityModel: "TaskComment",
            entity: { $in: userCommentIds },
            isDeleted: false,
          },
          { $set: { isDeleted: true } },
          { session }
        );
      }

      // 4) Soft delete attachments uploaded by the user
      const uploadedAttachIds = await mongoose
        .model("Attachment")
        .find(
          { uploadedBy: this._id, isDeleted: false },
          { _id: 1, parent: 1, parentModel: 1 },
          { session }
        )
        .lean();

      if (uploadedAttachIds.length) {
        const ids = uploadedAttachIds.map((a) => a._id);
        await mongoose
          .model("Attachment")
          .updateMany(
            { _id: { $in: ids } },
            { $set: { isDeleted: true } },
            { session }
          );

        // Pull from respective parent attachments arrays
        const byParent = uploadedAttachIds.reduce((acc, a) => {
          const key = `${a.parentModel}:${a.parent}`;
          if (!acc[key])
            acc[key] = { model: a.parentModel, id: a.parent, ids: [] };
          acc[key].ids.push(a._id);
          return acc;
        }, {});
        await Promise.all(
          Object.values(byParent).map((g) =>
            mongoose
              .model(g.model)
              .updateOne(
                { _id: g.id },
                { $pull: { attachments: { $in: g.ids } } },
                { session }
              )
          )
        );

        // Related Notifications for these attachments
        await mongoose.model("Notification").updateMany(
          {
            entityModel: "Attachment",
            entity: { $in: ids },
            isDeleted: false,
          },
          { $set: { isDeleted: true } },
          { session }
        );
      }

      // 5) Soft delete notifications where user is recipient or creator
      await mongoose.model("Notification").updateMany(
        {
          $or: [{ recipients: this._id }, { createdBy: this._id }],
          isDeleted: false,
        },
        { $set: { isDeleted: true } },
        { session }
      );

      this.$wasDeleted = true;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

userSchema.plugin(mongoosePaginate);

export const User = mongoose.model("User", userSchema);
export default User;
