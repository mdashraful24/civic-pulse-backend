import httpStatus from "http-status";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminService } from "./admin.service";
import type { AdminUsersQuery } from "./admin.validation";

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

export const AdminController = {
	listUsers,
	updateUserImage,
	removeUserImage,
};
