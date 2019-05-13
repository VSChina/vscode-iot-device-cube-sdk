import * as vscode from 'vscode';
import { EventEmitter } from 'events';

interface DeviceInfo {
  id: string;
  mac: string;
  ip?: string;
  host?: string;
  ssid?: string;
}

interface Volume {
  path: string;
  name?: string | undefined;
}

export class FileSystem {
  static async listVolume() {
    return await vscode.commands.executeCommand('iotcube.fsListVolume') as Volume[];
  }

  static async copyFile(sourcePath: string, targetPath: string) {
    return await vscode.commands.executeCommand('iotcube.fsCopyFile', sourcePath, targetPath) as void;
  }
}

export class SSH {
  static async discover() {
    return await vscode.commands.executeCommand('iotcube.sshDiscover') as DeviceInfo[];
  }

  private _id: number|null = null;

  async open(host: string, port: number, username: string, password: string) {
    if (this._id !== null) {
      throw new Error('You must close current connection before open a new one.');
    }
    this._id = await vscode.commands.executeCommand('iotcube.sshOpen', host, port, username, password) as number;
  }

  async close() {
    if (this._id !== null) {
      await vscode.commands.executeCommand('iotcube.sshClose', this._id);
      this._id = null;
    }
  }

  spawn(command: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before execute commands.');
    }
    const event = new EventEmitter();
    const spawnCallbackCommandName = `iotcubesdk.spawn${new Date().getTime()}_${Math.round(Math.random() * 100)}`;
    const spawnCallback = vscode.commands.registerCommand(spawnCallbackCommandName, (eventName: string, payload?: string|Error) => {
      event.emit(eventName, payload);
      if (eventName === 'error' || eventName === 'close') {
        spawnCallback.dispose();
      }
    });

    vscode.commands.executeCommand('iotcube.sshSpawn', this._id, command, spawnCallbackCommandName);
    return event;
  }

  async exec(command: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before execute commands.');
    }
    return await vscode.commands.executeCommand('iotcube.sshExec', this._id, command) as string;
  }

  async uploadFile(localPath: string, remotePath: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before upload files.');
    }
    return await vscode.commands.executeCommand('iotcube.sshUploadFile', this._id, localPath, remotePath) as void;
  }

  async uploadFolder(localFolderPath: string, remoteFolderPath: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before upload files.');
    }
    return await vscode.commands.executeCommand('iotcube.sshUploadFolder', this._id, localFolderPath, remoteFolderPath) as void;
  }
}