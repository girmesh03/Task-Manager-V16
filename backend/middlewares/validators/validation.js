// backend/middlewares/validation.js
import { validationResult } from "express-validator";
import CustomError from "../../errorHandler/CustomError.js";

// Generic validation error handler
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().reduce((acc, error) => {
      // express-validator exposes the field name in `param`
      const key = error.param || error.path || error.location || 'field';
      acc[key] = error.msg;
      return acc;
    }, {});
    return next(
      new CustomError(
        `Validation failed: ${Object.values(errorMessages).join(". ")}`,
        400,
        "VALIDATION_ERROR"
      )
    );
  }
  next();
};
