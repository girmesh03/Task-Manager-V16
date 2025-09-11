// backend/controllers/authController.js
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import { Organization, Department, User } from "../models/index.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
} from "../utils/generateTokens.js";
import CustomError from "../errorHandler/CustomError.js";
import checkUserStatus from "../utils/userStatus.js";

// @desc    Register a new organization and associate department and SuperAdmin user
// @route   POST /api/auth/register
// @access  Public
export const registerOrganization = asyncHandler(async (req, res, next) => {
  const { organizationData, userData } = req.validated.body;

  // Start a new session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create a new organization
    const organization = new Organization({
      ...organizationData,
    });
    await organization.save({ session });

    // Check department name uniqueness within organization
    const existingDepartment = await Department.findOne({
      name: { $regex: new RegExp(`^${userData.departmentName}$`, "i") },
      organization: organization._id,
    }).session(session);

    if (existingDepartment) {
      throw new CustomError(
        "Department name already exists in this organization",
        409,
        "DEPARTMENT_NAME_EXISTS_ERROR"
      );
    }

    // Create a new department
    const department = new Department({
      name: userData.departmentName,
      description: userData.departmentDesc,
      organization: organization._id,
    });
    await department.save({ session });

    // Create SuperAdmin user
    const adminUser = new User({
      firstName: userData.firstName,
      lastName: userData.lastName,
      position: userData.position,
      email: userData.email,
      password: userData.password,
      role: "SuperAdmin",
      organization: organization._id,
      department: department._id,
    });
    await adminUser.save({ session });

    // Email verification here

    // Commit transaction
    await session.commitTransaction();

    // Send response
    res.status(201).json({
      success: true,
      message:
        "Organization, department and super admin user created successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// @desc    Authenticate user and set token via cookies
// @route   POST /api/auth/login
// @access  Public
export const loginUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.validated.body;

    // Find user with organization and department details
    const user = await User.findOne({ email })
      .select("+password")
      .populate({ path: "organization", select: "name isDeleted" })
      .populate({
        path: "department",
        select: "name organization isDeleted",
      });

    // Check if user exists
    if (!user) {
      return next(
        new CustomError(
          "Invalid email or password",
          401,
          "INVALID_CREDENTIALS_ERROR"
        )
      );
    }

    // Check organization, department and user status
    const userStatus = checkUserStatus(user);
    if (userStatus.status) {
      return next(
        new CustomError(userStatus.message, 401, userStatus.errorCode)
      );
    }

    // Verify password
    if (!(await user.comparePassword(password))) {
      return next(
        new CustomError(
          "Invalid email or password",
          401,
          "INVALID_CREDENTIALS_ERROR"
        )
      );
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Set cookies
    res.cookie("access_token", accessToken, getAccessTokenCookieOptions());
    res.cookie("refresh_token", refreshToken, getRefreshTokenCookieOptions());

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userResponse,
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Logout user and clear cookies
// @route   DELETE /api/auth/logout
// @access  Private
export const logoutUser = asyncHandler(async (req, res, next) => {
  try {
    // User is already authenticated via verifyJWT middleware
    // We can access the user via req.user

    // Clear cookies
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get new access token using refresh token
// @route   GET /api/auth/refresh-token
// @access  Private - Protected by verifyRefreshToken middleware
export const getRefreshToken = asyncHandler(async (req, res, next) => {
  try {
    // User is already authenticated via verifyRefreshToken middleware
    // We can access the authenticated user via req.user
    const user = req.user;

    // The refresh token has already been verified by the middleware
    // No need to extract or verify it again

    // Check organization, department and user status
    const userStatus = checkUserStatus(user);
    if (userStatus.status) {
      return next(
        new CustomError(userStatus.message, 401, userStatus.errorCode)
      );
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user._id);

    // Set new access token cookie
    res.cookie("access_token", newAccessToken, getAccessTokenCookieOptions());

    // Prepare user response without internal flags
    const userResponse =
      typeof user.toObject === "function" ? user.toObject() : { ...user };

    // Remove isDeleted flag from user, organization and department if present
    if (
      userResponse &&
      Object.prototype.hasOwnProperty.call(userResponse, "isDeleted")
    ) {
      delete userResponse.isDeleted;
    }

    if (
      userResponse &&
      userResponse.organization &&
      typeof userResponse.organization === "object" &&
      Object.prototype.hasOwnProperty.call(
        userResponse.organization,
        "isDeleted"
      )
    ) {
      delete userResponse.organization.isDeleted;
    }

    if (
      userResponse &&
      userResponse.department &&
      typeof userResponse.department === "object" &&
      Object.prototype.hasOwnProperty.call(userResponse.department, "isDeleted")
    ) {
      delete userResponse.department.isDeleted;
    }

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: userResponse,
    });
  } catch (error) {
    next(error);
  }
});
