// ProjectTask.js
import mongoose from "mongoose";
import validator from "validator";
import { BaseTask } from "./index.js";

/**
 * @typedef {Object} ProjectTask
 * @property {Date} startDate - When the project should start
 * @property {Date} dueDate - When the project is due
 * @property {string} vendorName - Name of the external vendor
 * @property {string} vendorContact - Contact information for the vendor
 * @property {number} estimatedCost - Estimated cost of the project
 * @property {number} actualCost - Actual cost of the project
 * @property {mongoose.Types.ObjectId[]} watchers - Array of User references
 * @property {string[]} tags - Array of tags for categorization
 */
const ProjectTaskSchema = new mongoose.Schema(
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
    vendorName: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      maxlength: [100, "Vendor name cannot exceed 100 characters"],
    },
    vendorContact: {
      type: String,
      required: [true, "Vendor contact is required"],
      trim: true,
      validate: {
        validator: function (v) {
          return validator.isEmail(v) || /^\+?[1-9]\d{1,14}$/.test(v);
        },
        message: "Vendor contact must be a valid email or phone number",
      },
    },
    estimatedCost: {
      type: Number,
      min: [0, "Estimated cost cannot be negative"],
    },
    actualCost: {
      type: Number,
      min: [0, "Actual cost cannot be negative"],
    },
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

// Tenant consistency: watchers must belong to same org/department
ProjectTaskSchema.pre("validate", async function (next) {
  try {
    if (!Array.isArray(this.watchers) || this.watchers.length === 0)
      return next();
    const countMismatch = await mongoose.model("User").countDocuments({
      _id: { $in: this.watchers },
      $or: [
        { organization: { $ne: this.organization } },
        { department: { $ne: this.department } },
      ],
    });
    if (countMismatch > 0) {
      return next(
        new Error(
          "All watchers must belong to the same organization and department as the task"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

ProjectTaskSchema.pre("save", function (next) {
  if (this.isModified("vendorName") && this.vendorName) {
    this.vendorName = this.vendorName.trim();
  }

  if (this.isModified("watchers") && Array.isArray(this.watchers)) {
    this.watchers = [...new Set(this.watchers.map((id) => id.toString()))].map(
      (s) => new mongoose.Types.ObjectId(s)
    );
  }

  if (this.startDate && this.dueDate && this.dueDate < this.startDate) {
    return next(
      new Error("Due date must be greater than or equal to start date")
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
            (s) => new mongoose.Types.ObjectId(s)
          );
          if (!update.$addToSet[f]) update.$addToSet[f] = {};
          update.$addToSet[f].$each = uniq;
        } else {
          if (!update.$addToSet[f]) update.$addToSet[f] = {};
          const id = new mongoose.Types.ObjectId(
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

ProjectTaskSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate();
    normalizeArrayUpdates(update, ["watchers"]);
    next();
  }
);

ProjectTaskSchema.index(
  { organization: 1, department: 1, vendorName: 1 },
  {
    collation: { locale: "en", strength: 2 },
    partialFilterExpression: { isDeleted: false },
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
