// ProjectTask.js
import mongoose from "mongoose";
import validator from "validator";
import { BaseTask } from "./BaseTask.js";

/**
 * @typedef {Object} ProjectTask
 * @property {Date} startDate - When the project should start
 * @property {Date} dueDate - When the project is due
 * @property {string} vendorName - Name of the external vendor
 * @property {string} vendorContact - Contact information for the vendor
 * @property {number} estimatedCost - Estimated cost of the project
 * @property {number} actualCost - Actual cost of the project
 */
const ProjectTaskSchema = new mongoose.Schema(
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
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: [true, "Vendor reference is required"],
    },
    estimatedCost: {
      type: Number,
      min: [0, "Estimated cost cannot be negative"],
    },
    actualCost: {
      type: Number,
      min: [0, "Actual cost cannot be negative"],
    },
  },
  {
    toJSON: BaseTask.schema.options.toJSON,
    toObject: BaseTask.schema.options.toObject,
  }
);

// watcher validations moved to BaseTask

ProjectTaskSchema.pre("save", function (next) {
  // vendor is stored as reference; vendor-related string fields should not be modified here

  // watcher normalization moved to BaseTask

  if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
    return next(
      new Error("Due date must be greater than or equal to start date")
    );
  }
  next();
});

// Prevent duplicate ProjectTask per organization + department + vendor
ProjectTaskSchema.pre("validate", async function (next) {
  try {
    if (!this.vendor || !this.organization || !this.department) return next();
    const query = {
      vendor: this.vendor,
      organization: this.organization,
      department: this.department,
      isDeleted: false,
    };
    if (!this.isNew) query._id = { $ne: this._id };
    const count = await mongoose.model("ProjectTask").countDocuments(query);
    if (count > 0) {
      return next(
        new Error(
          "A project with the same vendor already exists in this organization and department"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
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

ProjectTaskSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate();
    normalizeArrayUpdates(update, []);
    // persist normalized update
    this.setUpdate(update);
    next();
  }
);

ProjectTaskSchema.index(
  { organization: 1, department: 1, vendor: 1 },
  {
    partialFilterExpression: { isDeleted: false },
    unique: true,
  }
);

ProjectTaskSchema.index(
  { organization: 1, department: 1, status: 1, priority: 1, dueDate: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

export const ProjectTask = BaseTask.discriminator(
  "ProjectTask",
  ProjectTaskSchema
);
export default ProjectTask;
