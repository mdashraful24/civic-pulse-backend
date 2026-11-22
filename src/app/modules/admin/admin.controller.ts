import httpStatus from "http-status";
import { currentUser } from "../../middlewares/auth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminService } from "./admin.service";
import type {
	AdminActivityQuery,
	AdminAnalyticsQuery,
	AdminUsersQuery,
	AppSettingInput,
	ChangeRoleInput,
	ChangeStatusInput,
	CreateFlagInput,
	ModerationFlagsQuery,
	ResolveFlagInput,
} from "./admin.validation";

const listUsers = catchAsync(async (req, res) => {
	const result = await AdminService.listUsers(
		req.validatedQuery as AdminUsersQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Users retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const updateUserImage = catchAsync(async (req, res) => {
	if (!req.file) {
		throw AppError.badRequest(
			"No image uploaded. Send a JPEG, PNG, WebP or GIF file in the 'image' field.",
		);
	}

	const user = await AdminService.updateUserImage(
		req.params.id,
		req.file.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User photo uploaded successfully.",
		data: user,
	});
});

const removeUserImage = catchAsync(async (req, res) => {
	await AdminService.removeUserImage(req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User photo removed successfully.",
		data: null,
	});
});

const changeRole = catchAsync(async (req, res) => {
	const user = await AdminService.changeRole(
		currentUser(req).id,
		req.params.id,
		req.body as ChangeRoleInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User role updated.",
		data: user,
	});
});

const changeStatus = catchAsync(async (req, res) => {
	const user = await AdminService.changeStatus(
		currentUser(req).id,
		req.params.id,
		req.body as ChangeStatusInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User status updated.",
		data: user,
	});
});

const deleteUser = catchAsync(async (req, res) => {
	await AdminService.deleteUser(currentUser(req).id, req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User account deleted.",
		data: null,
	});
});

const resetPassword = catchAsync(async (req, res) => {
	const result = await AdminService.resetPassword(
		currentUser(req).id,
		req.params.id,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password reset. Share the temporary password securely.",
		data: result,
	});
});

const terminateSessions = catchAsync(async (req, res) => {
	await AdminService.terminateSessions(currentUser(req).id, req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "All active sessions were terminated.",
		data: null,
	});
});

const analytics = catchAsync(async (req, res) => {
	const data = await AdminService.analytics(
		req.validatedQuery as AdminAnalyticsQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Analytics retrieved.",
		data,
	});
});

const activity = catchAsync(async (req, res) => {
	const result = await AdminService.activity(
		req.validatedQuery as AdminActivityQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Activity log retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const listFlags = catchAsync(async (req, res) => {
	const result = await AdminService.listFlags(
		req.validatedQuery as ModerationFlagsQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Moderation reports retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const createFlag = catchAsync(async (req, res) => {
	const data = await AdminService.createFlag(
		currentUser(req).id,
		req.body as CreateFlagInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Report submitted for moderation.",
		data,
	});
});

const resolveFlag = catchAsync(async (req, res) => {
	const data = await AdminService.resolveFlag(
		currentUser(req).id,
		req.params.id,
		req.body as ResolveFlagInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Moderation report resolved.",
		data,
	});
});

const listSettings = catchAsync(async (_req, res) => {
	const data = await AdminService.listSettings();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Settings retrieved.",
		data,
	});
});

const updateSetting = catchAsync(async (req, res) => {
	const data = await AdminService.updateSetting(
		currentUser(req).id,
		req.body as AppSettingInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Setting saved.",
		data,
	});
});

export const AdminController = {
	listUsers,
	updateUserImage,
	removeUserImage,
	changeRole,
	changeStatus,
	deleteUser,
	resetPassword,
	terminateSessions,
	analytics,
	activity,
	listFlags,
	createFlag,
	resolveFlag,
	listSettings,
	updateSetting,
};
