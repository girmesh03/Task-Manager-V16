// TaskActivity.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";

/**
 * @typedef {Object} TaskActivity
 * @property {mongoose.Types.ObjectId} task - Reference to the parent task (polymorphic)
 * @property {string} taskModel - Model name of the parent task
 * @property {string} description - Description of the activity
 * @property {mongoose.Types.ObjectId[]} attachments - Array of Attachment references
 * @property {Date} loggedAt - When the activity was logged
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the activity
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Date} createdAt - Timestamp when the activity was created
 * @property {Date} updatedAt - Timestamp when the activity was last updated
 */
const TaskActivitySchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "taskModel",
      required: [true, "Task reference is required"],
    },
    taskModel: {
      type: String,
      required: [true, "Task model is required"],
      enum: {
        values: ["AssignedTask", "ProjectTask"],
        message: "Invalid task model",
      },
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
    loggedAt: { type: Date, default: Date.now },
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
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
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

// Tenant consistency: task's org/dept must match this
TaskActivitySchema.pre("validate", async function (next) {
  try {
    const Parent = mongoose.model(this.taskModel);
    const task = await Parent.findById(this.task)
      .select("organization department")
      .lean();
    if (!task) return next(new Error("Parent task not found"));
    if (
      String(task.organization) !== String(this.organization) ||
      String(task.department) !== String(this.department)
    ) {
      return next(
        new Error(
          "TaskActivity organization/department must match its parent task"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Index for efficient querying by task reference
TaskActivitySchema.index(
  {
    organization: 1,
    department: 1,
    taskModel: 1,
    task: 1,
    createdAt: -1,
  },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for createdBy user lookup
TaskActivitySchema.index(
  { organization: 1, createdBy: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

TaskActivitySchema.pre("save", function (next) {
  if (this.isModified("description") && this.description) {
    this.description = this.description.trim();
  }
  next();
});

/**
 * Cascade soft-delete to related entities and keep arrays in sync
 */
TaskActivitySchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      const attachIds = await mongoose
        .model("Attachment")
        .find(
          { parent: this._id, parentModel: "TaskActivity", isDeleted: false },
          { _id: 1 },
          { session }
        )
        .lean()
        .then((rows) => rows.map((r) => r._id));

      if (attachIds.length) {
        await mongoose
          .model("Attachment")
          .updateMany(
            { _id: { $in: attachIds } },
            { $set: { isDeleted: true } },
            { session }
          );

        // Pull them from self.attachments (in-memory) for this save
        if (Array.isArray(this.attachments) && this.attachments.length) {
          const rm = new Set(attachIds.map((id) => String(id)));
          this.attachments = this.attachments.filter(
            (id) => !rm.has(String(id))
          );
        }
      }

      await mongoose
        .model("Notification")
        .updateMany(
          { entity: this._id, entityModel: "TaskActivity", isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Comments under this activity
      const commentIds = await mongoose
        .model("TaskComment")
        .find(
          { parentModel: "TaskActivity", parent: this._id, isDeleted: false },
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

        // Attachments under those comments
        const commentAttachIds = await mongoose
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

        if (commentAttachIds.length) {
          await mongoose
            .model("Attachment")
            .updateMany(
              { _id: { $in: commentAttachIds } },
              { $set: { isDeleted: true } },
              { session }
            );

          await mongoose
            .model("TaskComment")
            .updateMany(
              { _id: { $in: commentIds } },
              { $pull: { attachments: { $in: commentAttachIds } } },
              { session }
            );
        }

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

      this.$wasDeleted = true;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

TaskActivitySchema.plugin(paginate);

export const TaskActivity = mongoose.model("TaskActivity", TaskActivitySchema);
export default TaskActivity;
