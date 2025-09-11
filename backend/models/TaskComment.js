// TaskComment.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";

/**
 * @typedef {Object} TaskComment
 * @property {mongoose.Types.ObjectId} parent - Reference to the parent entity (polymorphic)
 * @property {string} parentModel - Model name of the parent entity
 * @property {string} content - The comment content
 * @property {mongoose.Types.ObjectId[]} mentions - Array of User references mentioned in comment
 * @property {mongoose.Types.ObjectId[]} attachments - Array of Attachment references
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the comment
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Date} createdAt - Timestamp when the comment was created
 * @property {Date} updatedAt - Timestamp when the comment was last updated
 */
const TaskCommentSchema = new mongoose.Schema(
  {
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "parentModel",
      required: [true, "Parent reference is required"],
    },
    parentModel: {
      type: String,
      required: [true, "Parent model is required"],
      enum: {
        values: ["RoutineTask", "AssignedTask", "ProjectTask", "TaskActivity"],
        message: "Invalid parent model",
      },
    },
    content: {
      type: String,
      required: [true, "Comment content is required"],
      trim: true,
      maxlength: [2000, "Comment cannot exceed 2000 characters"],
    },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }],
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

// Tenant consistency: comment's org/dept must match parent entity
TaskCommentSchema.pre("validate", async function (next) {
  try {
    const Parent = mongoose.model(this.parentModel);
    const parent = await Parent.findById(this.parent)
      .select("organization department")
      .lean();
    if (!parent) return next(new Error("Parent entity not found"));
    if (
      String(parent.organization) !== String(this.organization) ||
      String(parent.department) !== String(this.department)
    ) {
      return next(
        new Error(
          "TaskComment organization/department must match its parent entity"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Index for efficient querying by parent reference
TaskCommentSchema.index(
  {
    organization: 1,
    department: 1,
    parentModel: 1,
    parent: 1,
    createdAt: -1,
  },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for createdBy user lookup
TaskCommentSchema.index(
  { organization: 1, createdBy: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for mentions lookup
TaskCommentSchema.index(
  { organization: 1, mentions: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

/**
 * Pre-save hook to normalize data and deduplicate mentions
 */
TaskCommentSchema.pre("save", function (next) {
  if (this.isModified("content") && this.content) {
    this.content = this.content.trim();
  }

  // Deduplicate mentions array
  if (this.isModified("mentions") && Array.isArray(this.mentions)) {
    this.mentions = [...new Set(this.mentions.map((id) => id.toString()))].map(
      (s) => mongoose.Types.ObjectId(s)
    );
  }

  next();
});

// Normalize update operations to deduplicate mentions
function normalizeArrayUpdates(update, fields) {
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
        ].map((s) => new mongoose.Types.ObjectId(s));
        update.$set[f] = uniq;
      }
    }
  }
}

TaskCommentSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate();
    normalizeArrayUpdates(update, ["mentions", "attachments"]);
    // persist normalized update back to the query
    this.setUpdate(update);
    next();
  }
);

/**
 * Cascade soft-delete to related entities and keep attachments array in sync
 */
TaskCommentSchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      const attachIds = await mongoose
        .model("Attachment")
        .find(
          { parent: this._id, parentModel: "TaskComment", isDeleted: false },
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

        // Remove them from in-memory attachments for this save
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
          { entity: this._id, entityModel: "TaskComment", isDeleted: false },
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

TaskCommentSchema.plugin(paginate);

export const TaskComment = mongoose.model("TaskComment", TaskCommentSchema);
export default TaskComment;
