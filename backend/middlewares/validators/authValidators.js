import { body } from "express-validator";
import { Organization } from "../../models/index.js";
import { handleValidationErrors } from "./validation.js";

/**
 * Validate user login
 * Checks if the email and password fields are present and valid.
 */
export const validateLogin = [
  body("email")
    .exists({ checkFalsy: true })
    .withMessage("Email is required")
    .bail()
    .trim()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail({ gmail_remove_dots: false }),

  body("password")
    .exists({ checkFalsy: true })
    .withMessage("Password is required")
    .bail()
    .trim()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body().custom((_, { req }) => {
    req.validated = req.validated || {};
    req.validated.body = {
      email: req.body.email.toLowerCase(),
      password: req.body.password,
    };

    return true;
  }),

  handleValidationErrors,
];

/**
 * Validate organization registration
 * Checks if the required fields are present and valid.
 */
export const validateOrgRegistration = [
  body("organizationData.name")
    .exists({ checkFalsy: true })
    .withMessage("Organization name is required")
    .bail()
    .isString()
    .withMessage("Organization name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Organization name must be 2-100 characters")
    .bail()
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("Organization name contains invalid characters")
    .bail()
    .custom(async (name) => {
      const existingOrganization = await Organization.findOne({
        name: name.toLowerCase(),
        isDeleted: false,
      });
      if (existingOrganization) {
        throw new Error("Organization name already exists");
      }
      return true;
    }),

  body("organizationData.email")
    .exists({ checkFalsy: true })
    .withMessage("Organization email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail({ gmail_remove_dots: false })
    .custom(async (email) => {
      const existingOrganization = await Organization.findOne({
        email: email.toLowerCase(),
        isDeleted: false,
      });
      if (existingOrganization) {
        throw new Error("Organization email already exists");
      }
      return true;
    }),

  body("organizationData.phone")
    .exists({ checkFalsy: true })
    .withMessage("Organization phone is required")
    .bail()
    .trim()
    .custom(async (value) => {
      if (!/^\+?[1-9]\d{1,14}$/.test(value)) {
        throw new Error("Phone number must be in E.164 format");
      }
      const existingOrganization = await Organization.findOne({
        phone: value,
        isDeleted: false,
      });
      if (existingOrganization) {
        throw new Error("Organization phone already exists");
      }
      return true;
    }),

  body("organizationData.address")
    .exists({ checkFalsy: true })
    .withMessage("Organization address is required")
    .bail()
    .isString()
    .withMessage("Address must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage("Address must be 2-200 characters"),

  body("organizationData.size")
    .exists({ checkFalsy: true })
    .withMessage("Organization size is required")
    .bail()
    .isIn(["Small", "Medium", "Large"])
    .withMessage("Invalid organization size"),

  body("organizationData.industry")
    .exists({ checkFalsy: true })
    .withMessage("Organization industry is required")
    .bail()
    .isIn([
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
    ])
    .withMessage("Invalid industry"),

  body("organizationData.logoUrl")
    .optional()
    .isURL()
    .withMessage("logoUrl must be a valid URL"),

  body("userData.firstName")
    .exists({ checkFalsy: true })
    .withMessage("First name is required")
    .bail()
    .isString()
    .withMessage("First name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be 2-50 characters")
    .bail()
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("First name contains invalid characters"),

  body("userData.lastName")
    .exists({ checkFalsy: true })
    .withMessage("Last name is required")
    .bail()
    .isString()
    .withMessage("Last name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be 2-50 characters")
    .bail()
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("Last name contains invalid characters"),

  body("userData.position")
    .exists({ checkFalsy: true })
    .withMessage("Position is required")
    .bail()
    .isString()
    .withMessage("Position must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Position must be 2-50 characters")
    .bail()
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage("Position contains invalid characters"),

  body("userData.email")
    .exists({ checkFalsy: true })
    .withMessage("User email is required")
    .bail()
    .isEmail()
    .withMessage("Please enter a valid email")
    .bail()
    .normalizeEmail({ gmail_remove_dots: false })
    .custom(async (email, { req }) => {
      if (
        email.toLowerCase() === req.body.organizationData.email.toLowerCase()
      ) {
        throw new Error("User email cannot be the same as organization email");
      }
      return true;
    }),

  body("userData.password")
    .exists({ checkFalsy: true })
    .withMessage("Password is required")
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body("userData.departmentName")
    .exists({ checkFalsy: true })
    .withMessage("Department name is required")
    .bail()
    .isString()
    .withMessage("Department name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Department name must be 2-50 characters"),

  body("userData.departmentDesc")
    .exists({ checkFalsy: true })
    .withMessage("Description is required")
    .bail()
    .isString()
    .withMessage("Description must be a string")
    .bail()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Description cannot exceed 200 characters"),

  body().custom((_, { req }) => {
    req.validated = req.validated || {};
    req.validated.body = {
      organizationData: {
        name: req.body.organizationData.name.toLowerCase(),
        email: req.body.organizationData.email.toLowerCase(),
        phone: req.body.organizationData.phone,
        address: req.body.organizationData.address,
        size: req.body.organizationData.size,
        industry: req.body.organizationData.industry,
        logoUrl: req.body.organizationData.logoUrl,
      },
      userData: {
        firstName: req.body.userData.firstName,
        lastName: req.body.userData.lastName,
        position: req.body.userData.position,
        role: "SuperAdmin",
        email: req.body.userData.email.toLowerCase(),
        password: req.body.userData.password,
        departmentName: req.body.userData.departmentName,
        departmentDesc: req.body.userData.departmentDesc,
      },
    };
    return true;
  }),

  handleValidationErrors,
];
