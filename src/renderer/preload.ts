import { contextBridge } from "electron";
import ollama from "./preload/ollama";
import message from "./preload/message";
import chat from "./preload/chat";
import document from "./preload/document";
import course from "./preload/course";
import model from "./preload/model";
import config from "./preload/config";
import error from "./preload/error";
import startup from "./preload/startup";
import { searchAPI } from "./preload/search";
import fileUpload from "./preload/fileUpload";
import context from "./preload/context";

const api: Window["api"] = {
  message,
  chat,
  document,
  course,
  ollama,
  model,
  config,
  error,
  startup,
  search: searchAPI,
  fileUpload,
  context,
};

contextBridge.exposeInMainWorld("api", api);
