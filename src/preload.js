const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('piWrapper', {
  platform: process.platform,
});
