// Pure Writing Agent contracts shared by browser orchestration and feature tests.
// This module intentionally has no DOM, storage, network, or project-global access.

(function exposeWritingAgentRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISystem6WritingAgentRuntime = api;
})(typeof globalThis !== "undefined" ? (/** @type {any} */ (globalThis)).window || null : null, () => {
  const runStates = Object.freeze([
    "preparing",
    "retrieving",
    "generating",
    "awaitingCommit",
    "committed",
    "aborted",
    "failed",
  ]);
  const terminalRunStates = new Set(["committed", "aborted", "failed"]);
  const allowedTransitions = Object.freeze({
    preparing: new Set(["retrieving", "generating", "aborted", "failed"]),
    retrieving: new Set(["generating", "aborted", "failed"]),
    generating: new Set(["awaitingCommit", "aborted", "failed"]),
    awaitingCommit: new Set(["committed", "aborted", "failed"]),
    committed: new Set(),
    aborted: new Set(),
    failed: new Set(),
  });
  const toolEffects = Object.freeze(["read", "proposal", "commit"]);
  const toolScopes = Object.freeze(["project", "source", "docmap", "scrap", "draft", "manuscript", "terms"]);

  function stableHash(value = "") {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function defaultIdFactory() {
    if (globalThis?.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeSourceScope(scope) {
    if (!scope) return { sourceIds: [], citationIds: [] };
    if (Array.isArray(scope)) {
      return { sourceIds: [...new Set(scope.map(String).filter(Boolean))], citationIds: [] };
    }
    return {
      sourceIds: [...new Set((scope.sourceIds || []).map(String).filter(Boolean))],
      citationIds: [...new Set((scope.citationIds || []).map(String).filter(Boolean))],
    };
  }

  function createAgentRun(input = {}, dependencies = {}) {
    const now = dependencies.now || (() => new Date().toISOString());
    const idFactory = dependencies.idFactory || defaultIdFactory;
    const startedAt = now();
    return {
      schemaVersion: 1,
      id: String(input.id || idFactory()),
      projectId: String(input.projectId || ""),
      sourceScope: normalizeSourceScope(input.sourceScope),
      taskKind: String(input.taskKind || "chat"),
      retryOf: String(input.retryOf || ""),
      promptVersion: String(input.promptVersion || ""),
      policyVersion: String(input.policyVersion || ""),
      skillVersion: String(input.skillVersion || ""),
      evidence: [],
      toolCalls: [],
      output: null,
      state: "preparing",
      stateHistory: [{ state: "preparing", at: startedAt }],
      startedAt,
      endedAt: "",
      error: null,
    };
  }

  function transitionAgentRun(run, nextState, details = {}, dependencies = {}) {
    if (!run || !runStates.includes(run.state)) throw new TypeError("AgentRun has an invalid current state.");
    if (!runStates.includes(nextState)) throw new TypeError(`Unknown AgentRun state: ${nextState}`);
    if (!allowedTransitions[run.state].has(nextState)) {
      throw new Error(`Invalid AgentRun transition: ${run.state} -> ${nextState}`);
    }
    const now = dependencies.now || (() => new Date().toISOString());
    run.state = nextState;
    run.stateHistory.push({
      state: nextState,
      at: now(),
      ...(details.note ? { note: String(details.note) } : {}),
    });
    if (Object.prototype.hasOwnProperty.call(details, "evidence")) run.evidence = clone(details.evidence || []);
    if (Object.prototype.hasOwnProperty.call(details, "toolCalls")) run.toolCalls = clone(details.toolCalls || []);
    if (Object.prototype.hasOwnProperty.call(details, "output")) run.output = clone(details.output);
    if (Object.prototype.hasOwnProperty.call(details, "error")) run.error = clone(details.error);
    if (terminalRunStates.has(nextState)) run.endedAt = now();
    return run;
  }

  function snapshotAgentRun(run) {
    return clone(run);
  }

  function schemaTypeMatches(value, type) {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") return !!value && typeof value === "object" && !Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  }

  function validateSchema(schema, value, path = "$") {
    if (!schema || typeof schema !== "object") return [];
    const errors = [];
    const declaredTypes = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
    if (declaredTypes.length && !declaredTypes.some((type) => schemaTypeMatches(value, type))) {
      return [`${path} must be ${declaredTypes.join(" or ")}.`];
    }
    if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
      errors.push(`${path} must be one of the declared enum values.`);
    }
    if (Object.prototype.hasOwnProperty.call(schema, "const") && !Object.is(schema.const, value)) {
      errors.push(`${path} must equal the declared constant.`);
    }
    if (typeof value === "string") {
      if (Number.isFinite(schema.minLength) && value.length < schema.minLength) errors.push(`${path} is shorter than minLength.`);
      if (Number.isFinite(schema.maxLength) && value.length > schema.maxLength) errors.push(`${path} is longer than maxLength.`);
      if (schema.pattern) {
        try {
          if (!new RegExp(schema.pattern).test(value)) errors.push(`${path} does not match the required pattern.`);
        } catch {
          errors.push(`${path} has an invalid schema pattern.`);
        }
      }
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path} is below minimum.`);
      if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path} is above maximum.`);
    }
    if (Array.isArray(value)) {
      if (Number.isFinite(schema.minItems) && value.length < schema.minItems) errors.push(`${path} has too few items.`);
      if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) errors.push(`${path} has too many items.`);
      if (schema.items) value.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`)));
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const properties = schema.properties || {};
      (schema.required || []).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required.`);
      });
      Object.entries(value).forEach(([key, child]) => {
        if (properties[key]) {
          errors.push(...validateSchema(properties[key], child, `${path}.${key}`));
        } else if (schema.additionalProperties === false) {
          errors.push(`${path}.${key} is not allowed.`);
        } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
          errors.push(...validateSchema(schema.additionalProperties, child, `${path}.${key}`));
        }
      });
    }
    return errors;
  }

  function normalizeToolDefinition(definition = {}) {
    const name = String(definition.name || "").trim();
    if (!/^[a-z][a-zA-Z0-9]{1,63}$/.test(name)) throw new TypeError("Tool name must be a stable lower-camel identifier.");
    if (!toolEffects.includes(definition.effect)) throw new TypeError(`Tool ${name} has an invalid effect.`);
    const scopes = [...new Set((definition.scope || []).map(String))];
    if (!scopes.length || scopes.some((scope) => !toolScopes.includes(scope))) {
      throw new TypeError(`Tool ${name} has an invalid or empty scope.`);
    }
    if (typeof definition.run !== "function") throw new TypeError(`Tool ${name} is missing run(context, input).`);
    const timeoutMs = Number(definition.timeoutMs || 8000);
    const maxResults = Number(definition.maxResults || 12);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new TypeError(`Tool ${name} has an invalid timeoutMs.`);
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new TypeError(`Tool ${name} has an invalid maxResults.`);
    return Object.freeze({
      name,
      description: String(definition.description || ""),
      inputSchema: clone(definition.inputSchema || { type: "object", additionalProperties: false }),
      outputSchema: clone(definition.outputSchema || {}),
      scope: Object.freeze(scopes),
      effect: definition.effect,
      timeoutMs,
      maxResults,
      run: definition.run,
    });
  }

  function providerToolDefinitions(definitions = [], allowedEffects = ["read", "proposal"]) {
    const allowed = new Set((allowedEffects || []).map(String));
    return [...definitions]
      .filter((tool) => tool && allowed.has(String(tool.effect || "")) && tool.effect !== "commit")
      .map((tool) => ({
        type: "function",
        function: {
          name: String(tool.name || ""),
          description: String(tool.description || ""),
          parameters: clone(tool.inputSchema || { type: "object", additionalProperties: false }),
        },
      }));
  }

  function normalizeProviderToolCalls(message = {}) {
    const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    return rawCalls.map((call, index) => {
      const rawArguments = call?.function?.arguments;
      let input = {};
      let argumentError = "";
      if (rawArguments && typeof rawArguments === "object") {
        input = clone(rawArguments);
      } else if (typeof rawArguments === "string" && rawArguments.trim()) {
        try {
          const parsed = JSON.parse(rawArguments);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            argumentError = "Tool arguments must decode to an object.";
          } else {
            input = parsed;
          }
        } catch (error) {
          argumentError = `Tool arguments are not valid JSON: ${String(error?.message || error)}`;
        }
      }
      return {
        id: String(call?.id || `tool-call-${index + 1}`),
        name: String(call?.function?.name || ""),
        input,
        argumentError,
      };
    });
  }

  function normalizeToolEnvelope(result, maxResults) {
    const source = result && typeof result === "object" && !Array.isArray(result)
      ? result
      : { data: result };
    let data = Object.prototype.hasOwnProperty.call(source, "data") ? source.data : null;
    let truncated = !!source.truncated;
    if (Array.isArray(data) && data.length > maxResults) {
      data = data.slice(0, maxResults);
      truncated = true;
    }
    return {
      ok: source.ok !== false,
      data,
      provenance: Array.isArray(source.provenance) ? source.provenance.map((item) => ({ ...item })) : [],
      truncated,
      error: source.error ? String(source.error) : null,
    };
  }

  function sourceScopeAllows(scope, item = {}) {
    const normalized = normalizeSourceScope(scope);
    if (normalized.sourceIds.length && !normalized.sourceIds.includes(String(item.sourceId || ""))) return false;
    if (normalized.citationIds.length && !normalized.citationIds.includes(String(item.citationId || item.citation || ""))) return false;
    return true;
  }

  function validateToolProvenance(envelope, context = {}) {
    const projectId = String(context.projectId || "");
    for (const item of envelope.provenance) {
      if (projectId && String(item.projectId || "") !== projectId) {
        throw new Error("Tool provenance escaped the active project.");
      }
      if (!sourceScopeAllows(context.sourceScope, item)) {
        throw new Error("Tool provenance escaped the allowed source scope.");
      }
    }
  }

  function authorizeToolCall(tool, context = {}) {
    if (!tool) return { ok: false, error: "Unknown tool." };
    if (context.allowedEffects && !context.allowedEffects.includes(tool.effect)) {
      return { ok: false, error: `Tool effect ${tool.effect} is not allowed for this run.` };
    }
    if (tool.effect === "commit") {
      if (context.invokedBy === "model") return { ok: false, error: "Models cannot invoke commit tools." };
      if (context.userConfirmed !== true) return { ok: false, error: "Commit requires an explicit user action." };
      if (!context.commitToken) return { ok: false, error: "Commit requires a one-use confirmation token." };
    }
    if (tool.scope.includes("project") && !context.projectId) {
      return { ok: false, error: "Project-scoped tool requires a project ID." };
    }
    return { ok: true, error: null };
  }

  function createToolRegistry(options = {}) {
    const tools = new Map();
    const defaultMaxRounds = Number.isInteger(options.maxRounds) ? options.maxRounds : 3;

    function register(definition) {
      const tool = normalizeToolDefinition(definition);
      if (tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
      tools.set(tool.name, tool);
      return tool;
    }

    async function invoke(name, context = {}, input = {}) {
      const tool = tools.get(String(name || ""));
      if (!tool) return { ok: false, data: null, provenance: [], truncated: false, error: `Unknown tool: ${name}` };
      const authorization = authorizeToolCall(tool, context);
      if (!authorization.ok) return { ok: false, data: null, provenance: [], truncated: false, error: authorization.error };
      const inputErrors = validateSchema(tool.inputSchema, input);
      if (inputErrors.length) {
        return { ok: false, data: null, provenance: [], truncated: false, error: inputErrors.join(" ") };
      }

      let timeoutId;
      try {
        const timeout = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Tool timed out after ${tool.timeoutMs}ms.`)), tool.timeoutMs);
        });
        const result = await Promise.race([Promise.resolve(tool.run(context, clone(input))), timeout]);
        const envelope = normalizeToolEnvelope(result, tool.maxResults);
        validateToolProvenance(envelope, context);
        if (envelope.ok && tool.outputSchema && Object.keys(tool.outputSchema).length) {
          const outputErrors = validateSchema(tool.outputSchema, envelope.data);
          if (outputErrors.length) throw new Error(`Invalid tool output: ${outputErrors.join(" ")}`);
        }
        return envelope;
      } catch (error) {
        return {
          ok: false,
          data: null,
          provenance: [],
          truncated: false,
          error: String(error?.message || error || "Tool failed."),
        };
      } finally {
        clearTimeout(timeoutId);
      }
    }

    async function runToolLoop({ next, context = {}, initial = null, maxRounds = defaultMaxRounds } = {}) {
      if (typeof next !== "function") throw new TypeError("runToolLoop requires next().");
      if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 3) {
        throw new RangeError("Tool loops are limited to one through three rounds.");
      }
      const calls = [];
      let modelState = initial;
      for (let round = 1; round <= maxRounds; round += 1) {
        const step = await next({ round, modelState, toolResults: calls.map((entry) => clone(entry)) });
        if (!step || step.done === true || !Array.isArray(step.calls) || !step.calls.length) {
          return { output: step?.output ?? modelState, toolCalls: calls, rounds: round - 1 };
        }
        for (const call of step.calls) {
          const result = call.argumentError
            ? {
                ok: false,
                data: null,
                provenance: [],
                truncated: false,
                error: String(call.argumentError),
              }
            : await invoke(call.name, { ...context, invokedBy: "model" }, call.input || {});
          calls.push({
            round,
            id: String(call.id || ""),
            name: String(call.name || ""),
            input: clone(call.input || {}),
            result,
          });
        }
        modelState = step.output ?? modelState;
      }
      const finalStep = await next({
        round: maxRounds + 1,
        modelState,
        toolResults: calls.map((entry) => clone(entry)),
        toolsDisabled: true,
      });
      const ignoredCalls = Array.isArray(finalStep?.calls) ? finalStep.calls.length : 0;
      return {
        output: finalStep?.output ?? modelState,
        toolCalls: calls,
        rounds: maxRounds,
        truncated: ignoredCalls > 0,
      };
    }

    return Object.freeze({
      register,
      get: (name) => tools.get(String(name || "")) || null,
      list: () => [...tools.values()],
      invoke,
      runToolLoop,
    });
  }

  function abortError() {
    if (typeof DOMException === "function") return new DOMException("The writing task was stopped.", "AbortError");
    const error = new Error("The writing task was stopped.");
    error.name = "AbortError";
    return error;
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError();
  }

  function createWritingAgentCoordinator(dependencies = {}) {
    if (typeof dependencies.generate !== "function") throw new TypeError("Writing Agent coordinator requires generate().");
    const now = dependencies.now || (() => new Date().toISOString());
    const idFactory = dependencies.idFactory || defaultIdFactory;

    async function run(input = {}) {
      const runRecord = createAgentRun(input, { now, idFactory });
      const notify = (state) => dependencies.onTransition?.(snapshotAgentRun(runRecord), state, input);
      notify("preparing");
      try {
        throwIfAborted(input.signal);
        const preflight = typeof dependencies.preflight === "function"
          ? await dependencies.preflight(input, snapshotAgentRun(runRecord))
          : {};
        throwIfAborted(input.signal);

        let prepared = {};
        if (typeof dependencies.retrieve === "function" && preflight?.skipRetrieval !== true) {
          transitionAgentRun(runRecord, "retrieving", {}, { now });
          notify("retrieving");
          prepared = await dependencies.retrieve(input, snapshotAgentRun(runRecord), preflight) || {};
          throwIfAborted(input.signal);
          runRecord.evidence = clone(prepared.evidence || []);
        }

        transitionAgentRun(runRecord, "generating", { evidence: runRecord.evidence }, { now });
        notify("generating");
        const generated = await dependencies.generate(input, snapshotAgentRun(runRecord), {
          ...preflight,
          ...prepared,
        });
        throwIfAborted(input.signal);
        const output = typeof generated === "string" ? generated : String(generated?.output || "");
        const outputDescriptor = {
          hash: stableHash(output),
          chars: output.length,
        };
        transitionAgentRun(runRecord, "awaitingCommit", {
          output: outputDescriptor,
          toolCalls: generated?.toolCalls || [],
        }, { now });
        notify("awaitingCommit");
        return { output, run: snapshotAgentRun(runRecord), generated };
      } catch (error) {
        const nextState = error?.name === "AbortError" || input.signal?.aborted ? "aborted" : "failed";
        if (!terminalRunStates.has(runRecord.state)) {
          transitionAgentRun(runRecord, nextState, {
            error: {
              name: String(error?.name || "Error"),
              message: String(error?.message || error || "Writing task failed."),
            },
          }, { now });
          notify(nextState);
        }
        error.agentRun = snapshotAgentRun(runRecord);
        throw error;
      }
    }

    return Object.freeze({ run });
  }

  return Object.freeze({
    runStates,
    toolEffects,
    toolScopes,
    stableHash,
    normalizeSourceScope,
    createAgentRun,
    transitionAgentRun,
    snapshotAgentRun,
    validateSchema,
    normalizeToolDefinition,
    providerToolDefinitions,
    normalizeProviderToolCalls,
    authorizeToolCall,
    createToolRegistry,
    createWritingAgentCoordinator,
  });
});
