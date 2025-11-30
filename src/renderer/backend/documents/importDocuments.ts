const importDocuments = (courseId: string, chatId: string) => {
  window.api.document.import(courseId, chatId);
};

export default importDocuments;
