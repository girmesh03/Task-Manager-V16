// Department.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import { capitalize } from "../utils/helpers.js";

/**
 * @typedef {Object} Department
 * @property {string} name - Department name
 * @property {string} description - Department description
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {boolean} isDeleted - Soft delete flag
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the department
 * @property {Date} createdAt - Timestamp when the department was created
 * @property {Date} updatedAt - Timestamp when the department was last updated
 */
const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Department name is required"],
      trim: true,
      maxlength: [50, "Department name cannot exceed 50 characters"],
    },
    description: {
      type: String,
      maxlength: [200, "Description cannot exceed 200 characters"],
      required: [true, "Description is required"],
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization reference is required"],
    },
    isDeleted: { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator (createdBy) is required"],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.id;
        return ret;
      },
    },
  }
);

// Ensure creator belongs to same organization
departmentSchema.pre("validate", async function (next) {
  try {
    const user = await mongoose
      .model("User")
      .findById(this.createdBy)
      .select("organization")
      .lean();
    if (!user) return next(new Error("createdBy user not found"));
    if (String(user.organization) !== String(this.organization)) {
      return next(
        new Error(
          "Department.creator must belong to the same organization as the department"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Indexes
departmentSchema.index(
  {
    organization: 1,
    name: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  }
);

departmentSchema.index({ organization: 1 });

// Pre-save Hook
departmentSchema.pre("save", function (next) {
  if (this.isModified("name")) this.name = this.name.toLowerCase().trim();
  if (this.isModified("description"))
    this.description = capitalize(this.description);
  next();
});

// Cascade soft-delete for department
departmentSchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      // Soft delete all users in the department
      await mongoose
        .model("User")
        .updateMany(
          { department: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all tasks in the department
      await mongoose
        .model("BaseTask")
        .updateMany(
          { department: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all task activities in the department
      await mongoose
        .model("TaskActivity")
        .updateMany(
          { department: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all task comments in the department
      await mongoose
        .model("TaskComment")
        .updateMany(
          { department: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all attachments in the department
      await mongoose
        .model("Attachment")
        .updateMany(
          { department: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all notifications in the department
      await mongoose
        .model("Notification")
        .updateMany(
          { department: this._id, isDeleted: false },
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

departmentSchema.plugin(mongoosePaginate);

export const Department = mongoose.model("Department", departmentSchema);
export default Department;
