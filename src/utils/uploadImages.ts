const UPLOAD_URL = 'https://share.akisolve.com/tikooh/upload_events.php';

export async function uploadImages(files: File[], folder: string): Promise<string[]> {
  if (!files.length) return [];
  const formData = new FormData();
  files.forEach((file) => formData.append('images[]', file));
  formData.append('folder', folder);
  const res = await fetch(UPLOAD_URL, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload HTTP error: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Upload failed');
  return data.uploaded as string[];
}
