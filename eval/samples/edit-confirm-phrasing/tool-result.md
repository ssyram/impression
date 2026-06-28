// my-plugins/task-tracker.ts  (offset=167, limit=66)

	// ── System prompt injection ───────────────────────────────────────────────
	// Adds active task list to the system prompt so the agent always knows what's pending.

	pi.on("before_agent_start", async (event: BeforeAgentStartEvent, _ctx) => {
		const pending = tasks.filter((t) => t.status === "pending");
		if (pending.length === 0) return;

		const taskLines = pending.map((t) => `  - [#${t.id}] ${t.text}`).join("\n");
		const injection = [
			"",
			"## Active Tasks (managed by task-tracker)",
			"The following tasks are still pending. You MUST complete or expire all of them before stopping.",
			taskLines,
			"",
			"Use the `task` tool to mark tasks as done (`done`) or stale (`expire`).",
			"If the agent loop ends while tasks remain pending, it will be automatically restarted.",
			"",
			`Exception: if you genuinely cannot continue right now (e.g. waiting for user input, blocked on external state),`,
			`output the exact tag ${CONFIRM_STOP_TAG} anywhere in your final message to acknowledge and suppress the restart.`,
		].join("\n");

		return {
			systemPrompt: event.systemPrompt + injection,
		};
	});

	// ── Loop enforcement ──────────────────────────────────────────────────────
	// When the agent loop ends, check for pending tasks. If any remain,
	// inject a follow-up user message to restart the loop.

	pi.on("agent_end", async (event, ctx) => {
		const pending = tasks.filter((t) => t.status === "pending");
		if (pending.length === 0) return;

		// Check if the agent explicitly acknowledged it cannot continue right now.
		// Any assistant message in this turn containing <CONFIRM-TO-STOP/> suppresses the restart.
		const confirmedStop = event.messages.some((m) => {
			const assistant = m as AssistantMessage;
			if (assistant.role !== "assistant") return false;
			return assistant.content.some((c) => c.type === "text" && c.text.includes(CONFIRM_STOP_TAG));
		});
		if (confirmedStop) return;

		const taskLines = pending.map((t) => `  - [#${t.id}] ${t.text}`).join("\n");
		const message = [
			"⚠️ Task list is not complete. The following tasks are still pending:",
			taskLines,
			"",
			"Please continue working. For each task, either:",
			"  • Complete the work and call `task(done, id)` to mark it done",
			"  • Call `task(expire, id)` if it is no longer relevant or has become stale",
			"",
			`If you genuinely cannot continue right now, output ${CONFIRM_STOP_TAG} to acknowledge and stop.`,
		].join("\n");

		// agent_end fires after the loop has ended (isStreaming = false).
		// Calling pi.sendUserMessage without deliverAs goes through the non-streaming path
		// and directly starts a new agent loop — which is what we want for enforcement.
		// If somehow still streaming (shouldn't happen here), fall back to followUp queuing.
		// NOTE: sendUserMessage is on the ExtensionAPI (pi), not on ctx.
		if (ctx.isIdle()) {
			pi.sendUserMessage(message);
		} else {
			pi.sendUserMessage(message, { deliverAs: "followUp" });
		}
	});
