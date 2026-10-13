export const isMissingLikeCountColumnError = (error) => {
  if (!error) {
    return false;
  }

  const message = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();

  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('like_count') &&
      (message.includes('does not exist') || message.includes('not found')))
  );
};

export const normalizeRequestLikeCount = (request) => ({
  ...request,
  like_count: Math.max(0, Number(request.like_count ?? request.likes ?? 0)),
});
