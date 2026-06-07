"use strict";

function createAutomationJobFilterService() {
  function jobMatchesSearch(job, search) {
    const needle = String(search || "").trim().toLowerCase();
    if (!needle) return true;
    return [
      job?.id,
      job?.name,
      job?.promptPreview,
      job?.schedule,
      job?.status,
      job?.deliver,
      job?.ownerPrincipalId,
      ...(Array.isArray(job?.skills) ? job.skills : []),
      ...(Array.isArray(job?.outputDocuments) ? job.outputDocuments.map((doc) => doc?.name || "") : []),
    ].join("\n").toLowerCase().includes(needle);
  }

  function jobMatchesOwner(job, ownerPrincipalId) {
    const owner = String(job?.ownerPrincipalId || "").trim();
    const expected = String(ownerPrincipalId || "").trim();
    if (!expected) return false;
    if (owner) return owner === expected;
    return expected === "owner";
  }

  return Object.freeze({
    jobMatchesOwner,
    jobMatchesSearch,
  });
}

module.exports = {
  createAutomationJobFilterService,
};
