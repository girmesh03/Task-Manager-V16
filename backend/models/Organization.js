// Organization.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import validator from "validator";
import { capitalize } from "../utils/helpers.js";
import { IndustryType, IndustrySize } from "../utils/constants.js";

/**
 * @typedef {Object} Organization
 * @property {string} name - Organization name
 * @property {string} email - Organization email
 * @property {string} phone - Organization phone number
 * @property {string} address - Organization address
 * @property {string} size - Organiz ation size (Small, Medium, Large)
 * @property {string} industry - Organization industry
 * @property {string} logoUrl - Organization logo URL
 * @property {boolean} isDeleted - Soft delete flag
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the organization
 * @property {Date} createdAt - Timestamp when the organization was created
 * @property {Date} updatedAt - Timestamp when the organization was last updated
 */
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      lowercase: true,
      trim: true,
      maxlength: [100, "Organization name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Organization email is required"],
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => validator.isEmail(v),
        message: "Please provide a valid email address",
      },
    },
    phone: {
      type: String,
      required: [true, "Organization phone number is required"],
      trim: true,
      validate: {
        validator: (v) => /^\+?[1-9]\d{1,14}$/.test(v),
        message: "Phone number must be in E.164 format",
      },
    },
    address: {
      type: String,
      required: [true, "Organization address is required"],
      maxlength: [200, "Address cannot exceed 200 characters"],
    },
    size: {
      type: String,
      enum: {
        values: IndustrySize,
        message: "Invalid organization size",
      },
      required: [true, "Organization size is required"],
    },
    industry: {
      type: String,
      enum: {
        values: IndustryType,
        message: "Invalid industry",
      },
      required: [true, "Organization industry is required"],
    },
    logoUrl: {
      type: String,
      validate: {
        validator: (v) =>
          !v ||
          validator.isURL(v, {
            protocols: ["http", "https"],
            require_protocol: true,
          }),
        message: "Logo URL must be a valid HTTP or HTTPS URL",
      },
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

// Indexes: make unique constraints soft-delete aware so deleted records can be recreated/restored
organizationSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
organizationSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
organizationSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Pre save hook
organizationSchema.pre("save", function (next) {
  if (this.isModified("name")) this.name = this.name.toLowerCase().trim();
  if (this.isModified("address") && this.address)
    this.address = capitalize(this.address);
  next();
});

// Cascade soft-delete for organization
organizationSchema.pre("save", async function (next) {
  if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
    const session = this.$session?.();
    try {
      // Soft delete all departments in the organization
      await mongoose
        .model("Department")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all users in the organization
      await mongoose
        .model("User")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all tasks in the organization
      await mongoose
        .model("BaseTask")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all task activities in the organization
      await mongoose
        .model("TaskActivity")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all task comments in the organization
      await mongoose
        .model("TaskComment")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all attachments in the organization
      await mongoose
        .model("Attachment")
        .updateMany(
          { organization: this._id, isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      // Soft delete all notifications in the organization
      await mongoose
        .model("Notification")
        .updateMany(
          { organization: this._id, isDeleted: false },
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

organizationSchema.plugin(mongoosePaginate);

export const Organization = mongoose.model("Organization", organizationSchema);
export default Organization;
