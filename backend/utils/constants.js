// backend/utils/constants.js
export const UserRole = ["SuperAdmin", "Admin", "Manager", "User"];

export const TaskStatus = ["To Do", "In Progress", "Completed", "Pending"];

export const TaskPriority = ["Low", "Medium", "High", "Urgent"];

export const NotificationType = [
  "TaskAssigned",
  "TaskUpdated",
  "TaskCommented",
  "ActivityLogged",
  "Reminder",
  "Announcement",
  "System",
];

export const EntityModel = [
  "RoutineTask",
  "AssignedTask",
  "ProjectTask",
  "TaskActivity",
  "TaskComment",
  "Attachment",
];

export const IndustryType = [
  "Hospitality",
  "Construction",
  "Education",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Technology",
  "Finance",
  "Transportation",
  "Utilities",
  "Telecommunications",
  "Government",
  "Non-Profit",
  "Other",
];

export const IndustrySize = ["Small", "Medium", "Large"];
