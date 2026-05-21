export const getImageContentType = (uri: string) => {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
  return {
    ext,
    contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  };
};

export const loadImageBytesFromUri = async (uri: string) => {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to read local image: ${response.status}`);
  }
  return response.arrayBuffer();
};
