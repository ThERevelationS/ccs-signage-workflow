/** Research may replace machine findings; staff response evidence remains historical. */
export function retainOfficeResearchResponseHistory(nextResearch, previousResearch) {
  if (!nextResearch || typeof nextResearch !== 'object') return nextResearch;
  return previousResearch && Object.hasOwn(previousResearch, 'staff_responses')
    ? { ...nextResearch, staff_responses: structuredClone(previousResearch.staff_responses) }
    : nextResearch;
}
