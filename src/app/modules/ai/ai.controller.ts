import httpStatus from "http-status";
import { currentUser } from "../../middlewares/auth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AIService } from "./ai.service";
import type {
	AiAssigneeInput,
	AiCategorizeInput,
	AiDuplicateInput,
	AiPrioritizeInput,
	AiSearchQuery,
	AiSummarizeInput,
	AiTriageInput,
} from "./ai.validation";

const ok = <T>(
	res: Parameters<typeof sendResponse>[0],
	message: string,
	data: T,
) =>
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message,
		data,
	});

const categorize = catchAsync(async (req, res) => {
	const data = await AIService.categorize(
		currentUser(req).id,
		req.body as AiCategorizeInput,
	);
	ok(res, "Category suggestion generated.", data);
});

const prioritize = catchAsync(async (req, res) => {
	const data = await AIService.prioritize(
		currentUser(req).id,
		req.body as AiPrioritizeInput,
	);
	ok(res, "Priority suggestion generated.", data);
});

const summarize = catchAsync(async (req, res) => {
	const data = await AIService.summarize(
		currentUser(req).id,
		req.body as AiSummarizeInput,
	);
	ok(res, "Summary generated.", data);
});

const duplicates = catchAsync(async (req, res) => {
	const data = await AIService.duplicates(
		currentUser(req).id,
		req.body as AiDuplicateInput,
	);
	ok(res, "Similar reports retrieved.", data);
});

const search = catchAsync(async (req, res) => {
	const data = await AIService.search(
		currentUser(req).id,
		req.validatedQuery as AiSearchQuery,
	);
	ok(res, "Semantic search completed.", data);
});

const recommendAssignee = catchAsync(async (req, res) => {
	const data = await AIService.recommendAssignee(
		currentUser(req).id,
		req.body as AiAssigneeInput,
	);
	ok(res, "Assignee recommendations generated.", data);
});

const triage = catchAsync(async (req, res) => {
	const data = await AIService.triage(
		currentUser(req).id,
		req.body as AiTriageInput,
	);
	ok(res, "Structured triage completed.", data);
});

const capabilities = catchAsync(async (req, res) => {
	ok(
		res,
		"AI capabilities retrieved.",
		AIService.capabilities(currentUser(req).id),
	);
});

export const AIController = {
	categorize,
	prioritize,
	summarize,
	duplicates,
	search,
	recommendAssignee,
	triage,
	capabilities,
};
