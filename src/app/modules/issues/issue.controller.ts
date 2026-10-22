import httpStatus from "http-status";
import { currentUser } from "../../middlewares/auth";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { IssueService } from "./issue.service";
import type {
	AssignIssueInput,
	CreateIssueInput,
	IssueListQuery,
	UpdateIssueInput,
	UpdateIssuePriorityInput,
	UpdateIssueStatusInput,
} from "./issue.validation";

const list = catchAsync(async (req, res) => {
	const result = await IssueService.list(req.validatedQuery as IssueListQuery);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issues retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const listMine = catchAsync(async (req, res) => {
	const result = await IssueService.listMine(
		currentUser(req).id,
		req.validatedQuery as IssueListQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Your issues retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const listAssigned = catchAsync(async (req, res) => {
	const result = await IssueService.listAssigned(
		currentUser(req).id,
		req.validatedQuery as IssueListQuery,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assigned issues retrieved.",
		data: result.items,
		meta: result.meta,
	});
});

const getById = catchAsync(async (req, res) => {
	const issue = await IssueService.getById(req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue retrieved.",
		data: issue,
	});
});

const history = catchAsync(async (req, res) => {
	const history = await IssueService.history(req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue history retrieved.",
		data: history,
	});
});

const create = catchAsync(async (req, res) => {
	const issue = await IssueService.create(
		currentUser(req).id,
		req.body as CreateIssueInput,
		req.file?.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Issue reported successfully.",
		data: issue,
	});
});

const update = catchAsync(async (req, res) => {
	const issue = await IssueService.update(
		currentUser(req),
		req.params.id,
		req.body as UpdateIssueInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue updated successfully.",
		data: issue,
	});
});

const updateImage = catchAsync(async (req, res) => {
	if (!req.file) {
		throw AppError.badRequest(
			"No image uploaded. Send a JPEG, PNG, WebP or GIF file in the 'image' field.",
		);
	}

	const issue = await IssueService.updateImage(
		currentUser(req),
		req.params.id,
		req.file.buffer,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue photo uploaded successfully.",
		data: issue,
	});
});

const remove = catchAsync(async (req, res) => {
	await IssueService.remove(currentUser(req), req.params.id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue deleted successfully.",
	});
});

const assign = catchAsync(async (req, res) => {
	const issue = await IssueService.assign(
		req.params.id,
		req.body as AssignIssueInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue assignment updated.",
		data: issue,
	});
});

const changeStatus = catchAsync(async (req, res) => {
	const issue = await IssueService.changeStatus(
		currentUser(req),
		req.params.id,
		req.body as UpdateIssueStatusInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue status updated.",
		data: issue,
	});
});

const changePriority = catchAsync(async (req, res) => {
	const issue = await IssueService.changePriority(
		req.params.id,
		req.body as UpdateIssuePriorityInput,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Issue priority updated.",
		data: issue,
	});
});

const stats = catchAsync(async (req, res) => {
	const stats = await IssueService.stats(currentUser(req));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Dashboard statistics retrieved.",
		data: stats,
	});
});

export const IssueController = {
	list,
	listMine,
	listAssigned,
	getById,
	history,
	create,
	update,
	updateImage,
	remove,
	assign,
	changeStatus,
	changePriority,
	stats,
};
