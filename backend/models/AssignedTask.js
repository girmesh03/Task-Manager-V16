// AssignedTask.js
import mongoose from "mongoose";
import { BaseTask } from "./BaseTask.js";

/**
 * @typedef {Object} AssignedTask
 * @property {Date} startDate - When the task should start
 * @property {Date} dueDate - When the task is due
 * @property {mongoose.Types.ObjectId[]} assignees - Array of User references
 */
const AssignedTaskSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
      validate: {
        validator: function (v) {
          if (!v) return false;
          return new Date(v) >= new Date();
        },
        message: "Start date cannot be in the past",
      },
    },
    dueDate: {
      type: Date,
      required: [true, "Due date is required"],
      validate: {
        validator: function (v) {
          if (!v || !this.startDate) return false;
          return v >= this.startDate;
        },
        message: "Due date must be greater than or equal to start date",
      },
    },
    assignees: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false, //validated in hook
      },
    ],
  },
  {
    toJSON: BaseTask.schema.options.toJSON,
    toObject: BaseTask.schema.options.toObject,
  }
);

// Tenant consistency and role checks:
// - assignees must belong to same organization AND same department as the task
// - watchers must belong to same organization (department may differ)
// - watchers must have role one of SuperAdmin, Admin, Manager
AssignedTaskSchema.pre("validate", async function (next) {
  try {
    // Skip validation when assignees not modified (except on new docs)
    if (!this.isNew && !this.isModified("assignees")) return next();
    const User = mongoose.model("User");

    // assignees validation
    const assignees = Array.isArray(this.assignees) ? this.assignees : [];
    if (assignees.length === 0) {
      return next(new Error("At least one assignee is required"));
    }
    const assigneeMismatch = await User.countDocuments({
      _id: { $in: assignees },
      $or: [
        { organization: { $ne: this.organization } },
        { department: { $ne: this.department } },
      ],
    });
    if (assigneeMismatch > 0) {
      return next(
        new Error(
          "All assignees must belong to the same organization and department as the task"
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
  // watcher normalization moved to BaseTask
  next();
});

// Ensure at least one assignee when creating or saving
AssignedTaskSchema.path("assignees").validate(function (value) {
  if (!Array.isArray(value)) return false;
  return value.length > 0;
}, "At least one assignee is required");

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
    normalizeArrayUpdates(update, ["assignees"]);
    // persist normalized update back to the query
    this.setUpdate(update);
    next();
  }
);

// Validate updates that modify dates, assignees or watchers
AssignedTaskSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();
    if (!update) return next();
    const User = mongoose.model("User");

    // Helper to read candidate startDate/dueDate from update
    const candidateStart =
      update.$set?.startDate ||
      update.startDate ||
      (update.$setOnInsert && update.$setOnInsert.startDate);
    const candidateDue =
      update.$set?.dueDate ||
      update.dueDate ||
      (update.$setOnInsert && update.$setOnInsert.dueDate);

    // If startDate provided, ensure not in past
    if (candidateStart) {
      if (new Date(candidateStart) < new Date()) {
        return next(new Error("Start date cannot be in the past"));
      }
    }

    // If both provided, ensure due >= start
    if (candidateDue && (candidateStart || update.$set?.startDate)) {
      const s = candidateStart ? new Date(candidateStart) : null;
      const d = new Date(candidateDue);
      if (s && d < s) return next(new Error("Due date must be >= start date"));
    }

    // If assignees are set, ensure not empty
    const assigneesSet =
      (update.$set &&
        Array.isArray(update.$set.assignees) &&
        update.$set.assignees) ||
      (update.assignees &&
        Array.isArray(update.assignees) &&
        update.assignees) ||
      (update.$addToSet &&
        update.$addToSet.assignees &&
        update.$addToSet.assignees.$each);
    if (assigneesSet) {
      if (assigneesSet.length === 0)
        return next(new Error("At least one assignee is required"));
      // verify org+department for provided assignees against the task's organization/department
      const task = await this.model.findOne(this.getQuery()).lean();
      if (!task) return next(new Error("Task not found for validation"));
      const mism = await User.countDocuments({
        _id: { $in: assigneesSet },
        $or: [
          { organization: { $ne: task.organization } },
          { department: { $ne: task.department } },
        ],
      });
      if (mism > 0)
        return next(
          new Error(
            "All assignees must belong to the same organization and department as the task"
          )
        );
    }

    // watcher validations moved to BaseTask

    next();
  } catch (err) {
    next(err);
  }
});

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
