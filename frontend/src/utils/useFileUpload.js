import { useState, useCallback, useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { getFastApiUrl } from '../config';

export function useFileUpload(initialFiles = [], allowedFormats = null, mode = "default") {
  const [uploadedFiles, setUploadedFiles] = useState(initialFiles);
  const {
    maxImageInput,
    model,
    models,
    updateModel,
    maxFileInput,
    switchVisionMode,
    switchNonVisionMode
  } = useContext(SettingsContext);
  const { showToast } = useToast();

  const processFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const generateId = () => `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const currentFiles = [...uploadedFiles];
    let maxAllowed = 4;
    if (mode === "image") {
      maxAllowed = maxImageInput;
    } else {
      maxAllowed = maxFileInput;
    }

    const availableSlotCount = maxAllowed - currentFiles.length;

    if (availableSlotCount <= 0) {
      showToast(`You can upload a maximum of ${maxAllowed} files.`);
      return;
    }

    const filesToProcess = files.slice(0, availableSlotCount);

    const placeholders = filesToProcess.map((file) => ({
      id: generateId(),
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      content: null,
      file_path: null,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    }));

    setUploadedFiles((prev) => [...prev, ...placeholders]);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const placeholder = placeholders[i];

      try {
        const formData = new FormData();
        formData.append('file', file);

        const endpoint = file.type.startsWith('image/') ? '/upload/image' : '/upload/file';
        const response = await fetch(`${getFastApiUrl()}${endpoint}`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });

        if (response.status === 401 && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/register')) {
          window.location.href = '/login?expired=true';
          return;
        }

        if (!response.ok) {
          throw new Error(`${file.name} could not be uploaded.`);
        }

        const data = await response.json();

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === placeholder.id
              ? {
                  ...f,
                  content: data.url,
                  file_path: data.url
                }
              : f
          )
        );
      } catch (error) {
        showToast(error.message || `Error processing ${file.name}.`);
        setUploadedFiles((prev) => prev.filter((f) => f.id !== placeholder.id));
      }
    }

    if (mode === "default") {
      const hasUploadedImages = filesToProcess.some((file) => file.type.startsWith('image/'));
      if (hasUploadedImages) {
        const selectedModel = models.find((m) => m.model_name === model);
        if (!selectedModel?.capabilities?.vision) {
          const visionModel = models.find((m) => m.capabilities?.vision);
          if (visionModel) {
            updateModel(visionModel.model_name);
            switchVisionMode();
            showToast("Switched to a vision-capable model.", "info");
          } else {
            showToast("The current model does not support image uploads.");
          }
        }
      }
    }
  }, [
    uploadedFiles,
    mode,
    maxImageInput,
    maxFileInput,
    model,
    models,
    updateModel,
    switchVisionMode,
    showToast
  ]);

  const removeFile = useCallback((id) => {
    setUploadedFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      const updated = prev.filter((f) => f.id !== id);

      if (mode === "default") {
        const remainingImages = updated.some((f) => f.type === 'image');
        if (!remainingImages) {
          switchNonVisionMode();
        }
      }

      return updated;
    });
  }, [mode, switchNonVisionMode]);

  return {
    uploadedFiles,
    setUploadedFiles,
    processFiles,
    removeFile
  };
}