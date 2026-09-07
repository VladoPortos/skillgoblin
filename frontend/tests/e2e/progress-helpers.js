// API test clients use the same optimistic revision contract as the UI.
export async function postProgress(request, url, options) {
  const state = await (await request.get(url)).json();
  const response = await request.post(url, { ...options, data: {
    ...options.data, revision: state.revisions?.[options.data.courseId] || 0
  }});
  if (!response.ok()) throw new Error(`Progress seed failed: ${response.status()} ${await response.text()}`);
  return response;
}
