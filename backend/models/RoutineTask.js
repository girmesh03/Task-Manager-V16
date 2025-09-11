// RoutineTask.js
import mongoose from "mongoose";
import { BaseTask } from "./BaseTask.js";

/**
 * @typedef {Object} RoutineTask
 * @property {Date} date - The date when the routine task was performed
 * @p
 */
const RoutineTaskSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Routine task log date is required"],
      validate: {
        validator: function (v) {
          if (!v) return false;
          // date must not be in the future
          return new Date(v) <= new Date();
        },
        message: "Routine task log date can not be in future",
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
    materials: [{ type: mongoose.Schema.Types.ObjectId, ref: "Material" }],
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

// Normalize materials array
RoutineTaskSchema.pre("save", function (next) {
  if (this.isModified("materials") && Array.isArray(this.materials)) {
    this.materials = [
      ...new Set(this.materials.map((id) => id.toString())),
    ].map((s) => mongoose.Types.ObjectId(s));
  }
  next();
});

export const RoutineTask = BaseTask.discriminator(
  "RoutineTask",
  RoutineTaskSchema
);
export default RoutineTask;
