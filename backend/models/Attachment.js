// Attachment.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";
import { validator } from "express-validator";

/**
 * Enumerations aligned with platform-wide constants.
 */
export const AttachmentType = ["image", "video", "document", "audio", "other"];

/**
 * @typedef {Object} Attachment
 * @property {string} originalName - Original file name
 * @property {string} storedName - Name as stored in storage system
 * @property {string} mimeType - MIME type of the file
 * @property {number} size - File size in bytes
 * @property {string} type - Type of attachment
 * @property {string} url - URL to access the file
 * @property {mongoose.Types.ObjectId} parent - Reference to the parent entity (polymorphic)
 * @property {string} parentModel - Model name of the parent entity
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} uploadedBy - Reference to User who uploaded the file
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Date} createdAt - Timestamp when the attachment was created
 * @property {Date} updatedAt - Timestamp when the attachment was last updated
 */
const AttachmentSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: [true, "Original file name is required"],
      trim: true,
      maxlength: [255, "File name cannot exceed 255 characters"],
    },
    storedName: {
      type: String,
      required: [true, "Stored file name is required"],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, "MIME type is required"],
    },
    size: {
      type: Number,
      required: [true, "File size is required"],
      min: [1, "File size must be at least 1 byte"],
    },
    type: {
      type: String,
      required: [true, "Attachment type is required"],
      enum: {
        values: AttachmentType,
        message: "Invalid attachment type",
      },
    },
    url: {
      type: String,
      required: [true, "File URL is required"],
      validate: {
        validator: function (v) {
          return validator.isURL(v, {
            protocols: ["http", "https"],
            require_protocol: true,
          });
        },
        message: "URL must be a valid HTTP or HTTPS URL",
      },
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
        values: [
          "RoutineTask",
          "AssignedTask",
          "ProjectTask",
          "TaskActivity",
          "TaskComment",
        ],
        message: "Invalid parent model",
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
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Uploader (uploadedBy) is required"],
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

// Tenant consistency: attachment org/dept must match parent entity
AttachmentSchema.pre("validate", async function (next) {
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
          "Attachment organization/department must match its parent entity"
        )
      );
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Index for efficient querying by parent reference
AttachmentSchema.index(
  {
    organization: 1,
    department: 1,
    parentModel: 1,
    parent: 1,
    createdAt: -1,
  },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for uploadedBy user lookup
AttachmentSchema.index(
  { organization: 1, uploadedBy: 1, createdAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for type-based filtering
AttachmentSchema.index(
  { organization: 1, department: 1, type: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

/**
 * Keep parent attachments array in sync on create and delete
 */
AttachmentSchema.pre("save", async function (next) {
  const session = this.$session?.();
  try {
    // On create: add to parent.attachments
    if (this.isNew && this.parent && this.parentModel) {
      await mongoose
        .model(this.parentModel)
        .updateOne(
          { _id: this.parent },
          { $addToSet: { attachments: this._id } },
          { session }
        );
    }
    // On soft-delete: remove from parent.attachments and delete related notifications
    if (this.isModified("isDeleted") && this.isDeleted && !this.$wasDeleted) {
      await mongoose
        .model("Notification")
        .updateMany(
          { entity: this._id, entityModel: "Attachment", isDeleted: false },
          { $set: { isDeleted: true } },
          { session }
        );

      await mongoose
        .model(this.parentModel)
        .updateOne(
          { _id: this.parent },
          { $pull: { attachments: this._id } },
          { session }
        );

      this.$wasDeleted = true;
    }
    next();
  } catch (err) {
    next(err);
  }
});

AttachmentSchema.plugin(paginate);

export const Attachment = mongoose.model("Attachment", AttachmentSchema);
export default Attachment;
