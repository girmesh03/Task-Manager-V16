// Notification.js
import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2";
import { NotificationType, EntityModel } from "../utils/constants.js";

/**
 * @typedef {Object} Notification
 * @property {string} type - Type of notification
 * @property {string} title - Notification title
 * @property {string} message - Notification message
 * @property {mongoose.Types.ObjectId} entity - Reference to the related entity (polymorphic)
 * @property {string} entityModel - Model name of the related entity
 * @property {mongoose.Types.ObjectId[]} recipients - Array of User references
 * @property {Object[]} readBy - Array of read records with user and timestamp
 * @property {mongoose.Types.ObjectId} organization - Reference to Organization
 * @property {mongoose.Types.ObjectId} department - Reference to Department
 * @property {mongoose.Types.ObjectId} createdBy - Reference to User who created the notification
 * @property {Date} sentAt - When the notification was sent
 * @property {boolean} isDeleted - Soft delete flag
 * @property {Date} createdAt - Timestamp when the notification was created
 * @property {Date} updatedAt - Timestamp when the notification was last updated
 */
const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, "Notification type is required"],
      enum: {
        values: NotificationType,
        message: "Invalid notification type",
      },
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    entity: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "entityModel",
    },
    entityModel: {
      type: String,
      enum: { values: EntityModel, message: "Invalid entity model" },
    },
    recipients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "At least one recipient is required"],
      },
    ],
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator (createdBy) is required"],
    },
    sentAt: { type: Date, default: Date.now },
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

// Tenant consistency: recipients and entity must belong to the same org/dept
NotificationSchema.pre("validate", async function (next) {
  try {
    if (!Array.isArray(this.recipients) || this.recipients.length === 0) {
      return next(new Error("At least one recipient is required"));
    }
    const mismatchRecipients = await mongoose.model("User").countDocuments({
      _id: { $in: this.recipients },
      $or: [
        { organization: { $ne: this.organization } },
        { department: { $ne: this.department } },
      ],
    });
    if (mismatchRecipients > 0) {
      return next(
        new Error(
          "All recipients must belong to the same organization and department as the notification"
        )
      );
    }
    if (this.entity && this.entityModel) {
      const Entity = mongoose.model(this.entityModel);
      const e = await Entity.findById(this.entity)
        .select("organization department")
        .lean();
      if (e) {
        if (
          String(e.organization) !== String(this.organization) ||
          String(e.department) !== String(this.department)
        ) {
          return next(
            new Error(
              "Notification organization/department must match its entity's organization/department"
            )
          );
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Index for efficient recipient lookup
NotificationSchema.index(
  { organization: 1, recipients: 1, sentAt: -1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for type-based filtering
NotificationSchema.index(
  { organization: 1, department: 1, type: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

// Index for entity reference lookup
NotificationSchema.index(
  { organization: 1, entityModel: 1, entity: 1 },
  { partialFilterExpression: { isDeleted: false } }
);

/**
 * Pre-save hook to deduplicate recipients array and readBy by user
 */
NotificationSchema.pre("save", function (next) {
  if (this.isModified("recipients") && Array.isArray(this.recipients)) {
    this.recipients = [
      ...new Set(this.recipients.map((id) => id.toString())),
    ].map((s) => new mongoose.Types.ObjectId(s));
  }
  if (this.isModified("readBy") && Array.isArray(this.readBy)) {
    const map = new Map(); // userId -> {user, readAt}
    for (const r of this.readBy) {
      const key = r.user.toString();
      if (!map.has(key) || (r.readAt && map.get(key).readAt < r.readAt)) {
        map.set(key, {
          user: new mongoose.Types.ObjectId(key),
          readAt: r.readAt || new Date(),
        });
      }
    }
    this.readBy = Array.from(map.values());
  }
  next();
});

// Normalize updates to deduplicate recipients and enforce uniqueness of readBy.user
NotificationSchema.pre(
  ["findOneAndUpdate", "updateMany", "updateOne"],
  function (next) {
    const update = this.getUpdate() || {};
    // recipients: convert $push -> $addToSet with $each dedup
    update.$addToSet = update.$addToSet || {};
    if (update.$push && update.$push.recipients !== undefined) {
      const val = update.$push.recipients;
      if (val && typeof val === "object" && Array.isArray(val.$each)) {
        const uniq = [...new Set(val.$each.map((v) => v.toString()))].map(
          (s) => new mongoose.Types.ObjectId(s)
        );
        update.$addToSet.recipients = { $each: uniq };
      } else {
        const id = new mongoose.Types.ObjectId(
          typeof val === "string" ? val : val.toString()
        );
        update.$addToSet.recipients = { $each: [id] };
      }
      delete update.$push.recipients;
      if (Object.keys(update.$push).length === 0) delete update.$push;
    }
    if (update.$set && Array.isArray(update.$set.recipients)) {
      const uniq = [
        ...new Set(update.$set.recipients.map((id) => id.toString())),
      ].map((s) => new mongoose.Types.ObjectId(s));
      update.$set.recipients = uniq;
    }

    // readBy: enforce uniqueness by 'user' by pulling duplicates before pushing
    const handleReadByArray = (arr) => {
      const seen = new Set();
      const uniq = [];
      for (const r of arr) {
        const userId = (r.user || r).toString();
        if (!seen.has(userId)) {
          seen.add(userId);
          uniq.push({
            user: new mongoose.Types.ObjectId(userId),
            readAt: r.readAt ? new Date(r.readAt) : new Date(),
          });
        }
      }
      return {
        uniq,
        users: Array.from(seen).map((s) => new mongoose.Types.ObjectId(s)),
      };
    };

    if (update.$push && update.$push.readBy !== undefined) {
      const val = update.$push.readBy;
      let arr;
      if (val && typeof val === "object" && Array.isArray(val.$each)) {
        arr = val.$each;
      } else {
        arr = [val];
      }
      const { uniq, users } = handleReadByArray(arr);
      update.$pull = update.$pull || {};
      update.$pull.readBy = { user: { $in: users } };
      update.$push.readBy = { $each: uniq };
    } else if (update.$addToSet && update.$addToSet.readBy !== undefined) {
      // Replace $addToSet for objects with pull + push to ensure uniqueness by user
      const val = update.$addToSet.readBy;
      let arr;
      if (val && typeof val === "object" && Array.isArray(val.$each)) {
        arr = val.$each;
      } else {
        arr = [val];
      }
      const { uniq, users } = handleReadByArray(arr);
      update.$pull = update.$pull || {};
      update.$pull.readBy = { user: { $in: users } };
      update.$push = update.$push || {};
      update.$push.readBy = { $each: uniq };
      delete update.$addToSet.readBy;
      if (Object.keys(update.$addToSet).length === 0) delete update.$addToSet;
    }
    if (update.$set && Array.isArray(update.$set.readBy)) {
      const { uniq } = (function () {
        const m = new Map();
        for (const r of update.$set.readBy) {
          const k = (r.user || r).toString();
          const val = {
            user: new mongoose.Types.ObjectId(k),
            readAt: r.readAt ? new Date(r.readAt) : new Date(),
          };
          m.set(k, val);
        }
        return { uniq: Array.from(m.values()) };
      })();
      update.$set.readBy = uniq;
    }

    this.setUpdate(update);
    next();
  }
);

NotificationSchema.plugin(paginate);

export const Notification = mongoose.model("Notification", NotificationSchema);
export default Notification;
