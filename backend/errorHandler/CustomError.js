// backend/errorHandler/CustomError.js
class CustomError extends Error {
  constructor(
    message,
    statusCode,
    errorCode = "OPERATIONAL_ERROR",
    context = {}
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.errorCode = errorCode;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    this.context = context;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default CustomError;
