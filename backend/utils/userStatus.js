// backend/utils/userStatus.js

 const checkUserStatus = (user) => {
  // Check if user exists
  if (!user) {
    return {
      status: true,
      message: "User not found",
      errorCode: "USER_NOT_FOUND_ERROR",
    };
  }

  // Multi-tenant integrity check: department must belong to the same organization
  // Defensive: callers may pass non-populated references; handle gracefully
  if (!user.organization || !user.department) {
    return {
      status: true,
      message: "User organization or department not populated",
      errorCode: "TENANT_CONTEXT_MISSING_ERROR",
    };
  }

  const orgId = String(user.organization._id || user.organization);
  const deptOrgId = String(user.department.organization || user.department);

  if (orgId !== deptOrgId) {
    return {
      status: true,
      message: "Department organization mismatch",
      errorCode: "TENANT_INTEGRITY_ERROR",
    };
  }

  // Check if user is deleted
  if (user.isDeleted) {
    return {
      status: true,
      message: "User is deleted",
      errorCode: "USER_DELETED_ERROR",
    };
  }

  // Check if organization is deleted
  if (user.organization.isDeleted) {
    return {
      status: true,
      message: "Organization is deleted",
      errorCode: "ORGANIZATION_DELETED_ERROR",
    };
  }

  // Check if department is deleted
  if (user.department.isDeleted) {
    return {
      status: true,
      message: "Department is deleted",
      errorCode: "DEPARTMENT_DELETED_ERROR",
    };
  }

  return { status: false };
};

export default checkUserStatus
