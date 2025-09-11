// Material.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";

/**
 * @typedef {Object} Material
 * @property {string} name - Name of the material
 * @property {number} quantity - Quantity used
 * @property {string} unit - Unit of measurement
 * @property {number} cost - Optional cost for the material
 * @property {mongoose.Types.ObjectId} parent - Reference to the parent entity (TaskActivity)
 * @property {string} parentModel - Model name of the parent entity (TaskActivity)
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} addedBy - Reference to User who added the material
 * @property {boolean} isDeleted - Soft delete flag
 */
const MaterialSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Material name is required"],
      trim: true,
      maxlength: [255, "Material name cannot exceed 255 characters"],
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [0, "Quantity cannot be negative"],
    },
    unit: {
      type: String,
      trim: true,
      maxlength: [50, "Unit cannot exceed 50 characters"],
    },
    cost: {
      type: Number,
      min: [0, "Cost cannot be negative"],
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "parentModel",
      required: [true, "Parent reference is required"],
    },
    parentModel: {
      type: String,
      required: [true, "Parent model is required"],
      enum: {
        values: ["TaskActivity", "RoutineTask"],
        message: "Material parent must be TaskActivity or RoutineTask",
      },
    },
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
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "addedBy is required"],
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

// Tenant consistency: parent must exist and org/department must match
MaterialSchema.pre("validate", async function (next) {
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
          "Material organization/department must match its parent TaskActivity"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Indexes
MaterialSchema.index(
  { organization: 1, department: 1, parentModel: 1, parent: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

MaterialSchema.index(
  { organization: 1, addedBy: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Keep parent.materials array in sync on create and delete
MaterialSchema.pre("save", async function (next) {
  const session = this.$session?.();
  try {
    // On create: add to parent.materials
    if (this.isNew && this.parent && this.parentModel) {
      await mongoose
        .model(this.parentModel)
        .updateOne(
          { _id: this.parent },
          { $addToSet: { materials: this._id } },
          { session }
        );
    }

    // On soft-delete: remove from parent.materials and soft-delete related notifications
    if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
      await mongoose
        .model("Notification")
        .updateMany(
          { entity: this._id, entityModel: "Material", isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      await mongoose
        .model(this.parentModel)
        .updateOne(
          { _id: this.parent },
          { $pull: { materials: this._id } },
          { session }
        );

      this.$wasDeleted = true;
    }
    next();
  } catch (err) {
    next(err);
  }
});

MaterialSchema.plugin(paginate);

export const Material = mongoose.model("Material", MaterialSchema);
export default Material;
