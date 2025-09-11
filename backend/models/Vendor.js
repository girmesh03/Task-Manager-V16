// Vendor.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";
import validator from "validator";

/**
 * @typedef {Object} Vendor
 * @property {string} name - Vendor name
 * @property {string} contact - Vendor contact (email or phone)
 * @property {mongoose.Types.ObjectId} organization - Organization vendor belongs to
 * @property {boolean} isDeleted - Soft delete flag
 */
const VendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Vendor name is required"],
      trim: true,
      maxlength: [200, "Vendor name cannot exceed 200 characters"],
    },
    contact: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || validator.isEmail(v) || /^\+?[1-9]\d{1,14}$/.test(v);
        },
        message: "Contact must be a valid email or phone number",
      },
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required for vendor"],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    isDeleted: { type: Boolean, default: false },
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

// Tenant consistency: if department provided, ensure it belongs to same organization
VendorSchema.pre("validate", async function (next) {
  try {
    if (!this.department) return next();
    const dept = await mongoose
      .model("Department")
      .findById(this.department)
      .select("organization")
      .lean();
    if (!dept) return next(new Error("Department not found for vendor"));
    if (String(dept.organization) !== String(this.organization)) {
      return next(
        new Error("Vendor.department must belong to the same organization")
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

VendorSchema.index(
  { organization: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

VendorSchema.plugin(paginate);

export const Vendor = mongoose.model("Vendor", VendorSchema);
export default Vendor;
