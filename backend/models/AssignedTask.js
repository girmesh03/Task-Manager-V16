// AssignedTask.js
import mongoose from "mongoose";
import { BaseTask } from "./index.js";

/**
 * @typedef {Object} AssignedTask
 * @property {Date} startDate - When the task should start
 * @property {Date} dueDate - When the task is due
 * @property {mongoose.Types.ObjectId[]} assignees - Array of User references
 * @property {mongoose.Types.ObjectId[]} watchers - Array of User references
 * @property {string[]} tags - Array of tags for categorization
 */
const AssignedTaskSchema = new mongoose.Schema(
  {
    startDate: { type: Date },
    dueDate: {
      type: Date,
      validate: {
        validator: function (v) {
          if (!v || !this.startDate) return true;
          return v >= this.startDate;
        },
        message: "Due date must be greater than or equal to start date",
      },
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "At least one assignee is required"],
      },
    ],
    watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
  },
  {
    toJSON: BaseTask.schema.options.toJSON,
    toObject: BaseTask.schema.options.toObject,
  }
);

// Tenant consistency: assignees and watchers must belong to same org/department
AssignedTaskSchema.pre("validate", async function (next) {
  try {
    const allUsers = [
      ...(Array.isArray(this.assignees) ? this.assignees : []),
      ...(Array.isArray(this.watchers) ? this.watchers : []),
    ];
    if (allUsers.length === 0) return next();
    const countMismatch = await mongoose.model("User").countDocuments({
      _id: { $in: allUsers },
      $or: [
        { organization: { $ne: this.organization } },
        { department: { $ne: this.department } },
      ],
    });
    if (countMismatch > 0) {
      return next(
        new Error(
          "All assignees and watchers must belong to the same organization and department as the task"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

AssignedTaskSchema.pre("save", function (next) {
  if (this.isModified("assignees") && Array.isArray(this.assignees)) {
    this.assignees = [
      ...new Set(this.assignees.map((id) => id.toString())),
    ].map((s) => mongoose.Types.ObjectId(s));
  }
  if (this.isModified("watchers") && Array.isArray(this.watchers)) {
    this.watchers = [...new Set(this.watchers.map((id) => id.toString()))].map(
      (s) => mongoose.Types.ObjectId(s)
    );
  }
  next();
});

// Normalize update operations to deduplicate arrays
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
        ].map((s) => mongoose.Types.ObjectId(s));
        update.$set[f] = uniq;
      }
    }
  }
}

AssignedTaskSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate();
    normalizeArrayUpdates(update, ["assignees", "watchers"]);
    next();
  }
);

AssignedTaskSchema.index(
  { organization: 1, department: 1, assignees: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

AssignedTaskSchema.index(
  { organization: 1, department: 1, status: 1, priority: 1, dueDate: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

export const AssignedTask = BaseTask.discriminator(
  "AssignedTask",
  AssignedTaskSchema
);
export default AssignedTask;
