// BaseTask.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";
import { TaskStatus, TaskPriority } from "../utils/constants.js";

/**
 * @typedef {Object} BaseTask
 * @property {string} title - The title of the task
 * @property {string} description - Detailed description of the task
 * @property {string} status - Current status of the task (To Do, In Progress, Completed, Pending)
 * @property {string} priority - Priority level of the task (Low, Medium, High, Urgent)
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the task
 * @property {mongoose.Types.ObjectId[]} attachments - Array of Attachment references
 * @property {mongoose.Types.ObjectId[]} watchers - Array of User references who watch the task
 * @property {string[]} tags - Array of tags for categorization
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Date} createdAt - Timestamp when the task was created
 * @property {Date} updatedAt - Timestamp when the task was last updated
 */

const BaseTaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    status: {
      type: String,
      enum: { values: TaskStatus, message: "Invalid task status" },
      default: "To Do",
    },
    priority: {
      type: String,
      enum: { values: TaskPriority, message: "Invalid task priority" },
      default: "Medium",
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator (createdBy) is required"],
    },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
    discriminatorKey: "taskType",
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.id;
        return ret;
      },
    },
  }
);

// Tenant consistency: createdBy must belong to the same organization and department
BaseTaskSchema.pre("validate", async function (next) {
  if (!this.isModified("createdBy") && !this.isNew) return next();
  try {
    const user = await mongoose
      .model("User")
      .findById(this.createdBy)
      .select("organization department")
      .lean();
    if (!user) return next(new Error("createdBy user not found"));
    if (
      String(user.organization) !== String(this.organization) ||
      String(user.department) !== String(this.department)
    ) {
      return next(
        new Error(
          "createdBy user organization/department mismatch with task organization/department"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Watcher tenant and role checks: watchers must belong to same organization and have allowed roles
BaseTaskSchema.pre("validate", async function (next) {
  try {
    // Skip validation if watchers not modified (except for new docs)
    if (!this.isNew && !this.isModified("watchers")) return next();
    if (!Array.isArray(this.watchers) || this.watchers.length === 0)
      return next();
    const User = mongoose.model("User");
    const orgMismatch = await User.countDocuments({
      _id: { $in: this.watchers },
      organization: { $ne: this.organization },
    });
    if (orgMismatch > 0) {
      return next(
        new Error(
          "All watchers must belong to the same organization as the task"
        )
      );
    }
    const allowedRoles = ["SuperAdmin", "Admin", "Manager"];
    const roleMismatch = await User.countDocuments({
      _id: { $in: this.watchers },
      role: { $nin: allowedRoles },
    });
    if (roleMismatch > 0) {
      return next(
        new Error("Watchers must have role SuperAdmin, Admin, or Manager")
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

BaseTaskSchema.index(
  { organization: 1, department: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

BaseTaskSchema.index(
  { organization: 1, createdBy: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Normalize minimal formatting only
BaseTaskSchema.pre("save", function (next) {
  if (this.isModified("title") && this.title) {
    this.title = this.title.trim();
  }
  if (this.isModified("description") && this.description) {
    this.description = this.description.trim();
  }
  // normalize watchers and tags
  if (this.isModified("watchers") && Array.isArray(this.watchers)) {
    this.watchers = [...new Set(this.watchers.map((id) => id.toString()))].map(
      (s) => mongoose.Types.ObjectId(s)
    );
  }
  if (this.isModified("tags") && Array.isArray(this.tags)) {
    this.tags = [...new Set(this.tags.map((t) => String(t).trim()))];
  }
  next();
});

// Normalize update operations to deduplicate arrays for watchers and tags
function normalizeBaseArrayUpdates(update, fields) {
  if (!update || typeof update !== "object") return;
  update.$addToSet = update.$addToSet || {};
  if (update.$push) {
    for (const f of fields) {
      if (update.$push[f] !== undefined) {
        const val = update.$push[f];
        if (val && typeof val === "object" && Array.isArray(val.$each)) {
          const uniq = [...new Set(val.$each.map((v) => v.toString()))].map(
            (s) => mongoose.Types.ObjectId(s)
          );
          if (!update.$addToSet[f]) update.$addToSet[f] = {};
          update.$addToSet[f].$each = uniq;
        } else {
          if (!update.$addToSet[f]) update.$addToSet[f] = {};
          const id = mongoose.Types.ObjectId(
            typeof val === "string" ? val : val.toString()
          );
          if (!update.$addToSet[f].$each) update.$addToSet[f].$each = [];
          update.$addToSet[f].$each.push(id);
        }
        delete update.$push[f];
      }
    }
    if (Object.keys(update.$push).length === 0) delete update.$push;
  }
  if (update.$set) {
    for (const f of fields) {
      if (Array.isArray(update.$set[f])) {
        const uniq = [
          ...new Set(update.$set[f].map((id) => id.toString())),
        ].map((s) => mongoose.Types.ObjectId(s));
        update.$set[f] = uniq;
      }
    }
  }
}

BaseTaskSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate();
    normalizeBaseArrayUpdates(update, ["watchers", "tags"]);
    // persist normalized update back to the query
    this.setUpdate(update);
    next();
  }
);

// Helper for cascading deletes to grandchildren without relying on their document middleware
async function cascadeDeleteFromTask(taskDoc, session) {
  const modelName = taskDoc.constructor.modelName;

  // 1) Task-level attachments
  const taskAttachmentIds = await mongoose
    .model("Attachment")
    .find(
      { parent: taskDoc._id, parentModel: modelName, isDeleted: false },
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

  // Remove those attachments from this task's attachments array in memory
  if (Array.isArray(taskDoc.attachments) && taskDoc.attachments.length) {
    const rm = new Set(taskAttachmentIds.map((id) => String(id)));
    taskDoc.attachments = taskDoc.attachments.filter(
      (id) => !rm.has(String(id))
    );
  }

  // Materials attached directly to task (e.g., RoutineTask) - soft-delete and remove from array
  const taskMaterialIds = await mongoose
    .model("Material")
    .find(
      { parent: taskDoc._id, parentModel: modelName, isDeleted: false },
      { _id: 1 },
      { session }
    )
    .lean()
    .then((rows) => rows.map((r) => r._id));

  if (taskMaterialIds.length) {
    await mongoose
      .model("Material")
      .updateMany(
        { _id: { $in: taskMaterialIds } },
        { $set: { isDeleted: true } },
        { session }
      );
  }

  if (Array.isArray(taskDoc.materials) && taskDoc.materials.length) {
    const rmM = new Set(taskMaterialIds.map((id) => String(id)));
    taskDoc.materials = taskDoc.materials.filter((id) => !rmM.has(String(id)));
  }

  // 2) Task-level notifications
  await mongoose
    .model("Notification")
    .updateMany(
      { entity: taskDoc._id, entityModel: modelName, isDeleted: false },
      { $set: { isDeleted: true } },
      { session }
    );

  // 3) TaskComments under this task
  const commentIds = await mongoose
    .model("TaskComment")
    .find(
      { parent: taskDoc._id, parentModel: modelName, isDeleted: false },
      { _id: 1 },
      { session }
    )
    .lean()
    .then((rows) => rows.map((r) => r._id));

  if (commentIds.length) {
    await mongoose
      .model("TaskComment")
      .updateMany(
        { _id: { $in: commentIds }, isDeleted: false },
        { $set: { isDeleted: true } },
        { session }
      );

    // 3a) Attachments under those comments
    const commentAttachmentIds = await mongoose
      .model("Attachment")
      .find(
        {
          parentModel: "TaskComment",
          parent: { $in: commentIds },
          isDeleted: false,
        },
        { _id: 1 },
        { session }
      )
      .lean()
      .then((rows) => rows.map((r) => r._id));

    if (commentAttachmentIds.length) {
      await mongoose
        .model("Attachment")
        .updateMany(
          { _id: { $in: commentAttachmentIds } },
          { $set: { isDeleted: true } },
          { session }
        );

      // Pull from each comment's attachments array
      await mongoose
        .model("TaskComment")
        .updateMany(
          { _id: { $in: commentIds } },
          { $pull: { attachments: { $in: commentAttachmentIds } } },
          { session }
        );
    }

    // 3b) Notifications referencing those comments
    await mongoose.model("Notification").updateMany(
      {
        entityModel: "TaskComment",
        entity: { $in: commentIds },
        isDeleted: false,
      },
      { $set: { isDeleted: true } },
      { session }
    );
  }

  // 4) TaskActivity under this task (only for AssignedTask and ProjectTask)
  if (modelName === "AssignedTask" || modelName === "ProjectTask") {
    const activityIds = await mongoose
      .model("TaskActivity")
      .find(
        { task: taskDoc._id, taskModel: modelName, isDeleted: false },
        { _id: 1 },
        { session }
      )
      .lean()
      .then((rows) => rows.map((r) => r._id));

    if (activityIds.length) {
      await mongoose
        .model("TaskActivity")
        .updateMany(
          { _id: { $in: activityIds }, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // 4a) Attachments under activities
      const activityAttachmentIds = await mongoose
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

      if (activityAttachmentIds.length) {
        await mongoose
          .model("Attachment")
          .updateMany(
            { _id: { $in: activityAttachmentIds } },
            { $set: { isDeleted: true } },
            { session }
          );

        await mongoose
          .model("TaskActivity")
          .updateMany(
            { _id: { $in: activityIds } },
            { $pull: { attachments: { $in: activityAttachmentIds } } },
            { session }
          );
      }

      // 4b) Notifications referencing activities
      await mongoose.model("Notification").updateMany(
        {
          entityModel: "TaskActivity",
          entity: { $in: activityIds },
          isDeleted: false,
        },
        { $set: { isDeleted: true } },
        { session }
      );

      // 4c) Comments under activities and their sub-cascades
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
            { _id: { $in: activityCommentIds }, isDeleted: false },
            { $set: { isDeleted: true } },
            { session }
          );

        const activityCommentAttachmentIds = await mongoose
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

        if (activityCommentAttachmentIds.length) {
          await mongoose
            .model("Attachment")
            .updateMany(
              { _id: { $in: activityCommentAttachmentIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          await mongoose
            .model("TaskComment")
            .updateMany(
              { _id: { $in: activityCommentIds } },
              { $pull: { attachments: { $in: activityCommentAttachmentIds } } },
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

BaseTaskSchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      await cascadeDeleteFromTask(this, session);
      this.$wasDeleted = true;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

BaseTaskSchema.plugin(paginate);

export const BaseTask = mongoose.model("BaseTask", BaseTaskSchema);
export default BaseTask;
