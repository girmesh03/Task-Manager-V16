// RoutineTask.js
import mongoose from "mongoose";
import { BaseTask } from "./index.js";

/**
 * @typedef {Object} RoutineTask
 * @property {Date} date - The date when the routine task was performed
 * @p
 */
const RoutineTaskSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required"],
      validate: {
        validator: function (v) {
          return v <= new Date();
        },
        message: "Date cannot be in the future",
      },
    },
    // Explicitly define status with RoutineTask-specific constraints
    status: {
      type: String,
      enum: {
        values: ["Completed", "Pending"],
        message:
          'Status for RoutineTask must be either "Completed" or "Pending".',
      },
      default: "Completed",
    },
    // Explicitly define priority with RoutineTask-specific constraints
    priority: {
      type: String,
      enum: {
        values: ["Medium", "High", "Urgent"],
        message:
          'Priority for RoutineTask must be "Medium", "High", or "Urgent".',
      },
      default: "Medium",
    },
  },
  {
    toJSON: BaseTask.schema.options.toJSON,
    toObject: BaseTask.schema.options.toObject,
  }
);

// Normalize updates to avoid setting status/priority to null after creation
RoutineTaskSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate() || {};
    // Handle direct $set and top-level keys
    const set = update.$set || update;
    if (
      Object.prototype.hasOwnProperty.call(set, "status") &&
      set.status == null
    ) {
      set.status = "Completed";
    }
    if (
      Object.prototype.hasOwnProperty.call(set, "priority") &&
      set.priority == null
    ) {
      set.priority = "Medium";
    }
    if (update.$set) update.$set = set;
    else Object.assign(update, set);
    this.setUpdate(update);
    next();
  }
);

RoutineTaskSchema.index(
  { organization: 1, department: 1, date: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

export const RoutineTask = BaseTask.discriminator(
  "RoutineTask",
  RoutineTaskSchema
);
export default RoutineTask;
