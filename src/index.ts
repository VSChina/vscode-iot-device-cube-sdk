import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
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
    return (await vscode.commands.executeCommand(
      'iotcube.fsListVolume'
    )) as Volume[];
  }

  static async readFile(localPath: string, encoding?: string) {
    const data = (await vscode.commands.executeCommand(
      'iotcube.fsReadFile',
      localPath,
      encoding
    )) as string;

    const dataBuffer = Buffer.from(data, 'base64');
    if (encoding) {
      return dataBuffer.toString(encoding);
    }
    return dataBuffer;
  }

  static async copyFile(sourcePath: string, targetPath: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.fsCopyFile',
      sourcePath,
      targetPath
    )) as void;
  }

  static async transferFile(remotePath: string, localPath: string) {
    return new Promise(
      async (
        resolve: (value: void) => void,
        reject: (reason: Error) => void
      ) => {
        localPath = path.join(localPath, path.basename(remotePath));
        const transferFileCallbackName = (await vscode.commands.executeCommand(
          'iotcube.fsTransferFile',
          localPath
        )) as string;
        const data: string[] = [];
        const readStream = fs.createReadStream(remotePath, 'base64');
        readStream.on('data', (chunk: string) => {
          data.push(chunk);
        });
        readStream.on('close', async () => {
          readStream.destroy();
          for (const chunk of data) {
            await vscode.commands.executeCommand(
              transferFileCallbackName,
              chunk
            );
          }
          await vscode.commands.executeCommand(transferFileCallbackName, 'EOF');
          resolve();
        });
        readStream.on('error', (error: Error) => {
          reject(error);
        });
      }
    );
  }

  static async writeFile(localPath: string, data: string | Buffer) {
    return new Promise(async (resolve: (value: void) => void) => {
      const transferFileCallbackName = (await vscode.commands.executeCommand(
        'iotcube.fsTransferFile',
        localPath
      )) as string;
      const base64Data =
        typeof data === 'string'
          ? Buffer.from(data).toString('base64')
          : data.toString('base64');
      await vscode.commands.executeCommand(
        transferFileCallbackName,
        base64Data
      );
      await vscode.commands.executeCommand(transferFileCallbackName, 'EOF');
      resolve();
    });
  }

  static async exists(localPath: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.fsExists',
      localPath
    )) as boolean;
  }

  static async isDirectory(localPath: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.fsIsDirectory',
      localPath
    )) as boolean;
  }

  static async isFile(localPath: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.fsIsFile',
      localPath
    )) as boolean;
  }

  static async mkDir(localPath: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.fsMkDir',
      localPath
    )) as void;
  }
}

export class Utility {
  static require<T extends object>(modId: string): T {
    return new Proxy((() => {}) as T, {
      get: async (_, key, reciver) => {
        const localModuleRaw = (await vscode.commands.executeCommand(
          'iotcube.localRequire',
          modId,
          key
        )) as string;
        const localModuleInfo = JSON.parse(localModuleRaw);
        if (localModuleInfo.type === 'function') {
          // tslint:disable-next-line:no-any
          return async (...args: any[]) => {
            const modRaw = (await vscode.commands.executeCommand(
              'iotcube.localRequire',
              modId,
              key,
              args
            )) as string;
            const modInfo = JSON.parse(modRaw);
            return modInfo.res as string;
          };
        } else {
          return localModuleInfo.res as string;
        }
      },
    });
  }
}

export class SSH {
  static async discover() {
    return (await vscode.commands.executeCommand(
      'iotcube.sshDiscover'
    )) as DeviceInfo[];
  }

  private _id: number | null = null;

  async open(host: string, port: number, username: string, password: string) {
    if (this._id !== null) {
      throw new Error(
        'You must close current connection before open a new one.'
      );
    }
    this._id = (await vscode.commands.executeCommand(
      'iotcube.sshOpen',
      host,
      port,
      username,
      password
    )) as number;
  }

  async close() {
    if (this._id !== null) {
      await vscode.commands.executeCommand('iotcube.sshClose', this._id);
      this._id = null;
    }
  }

  spawn(command: string) {
    if (this._id === null) {
      throw new Error(
        'You must open an SSH connection before execute commands.'
      );
    }
    const event = new EventEmitter();
    const spawnCallbackCommandName = `iotcubesdk.spawn${new Date().getTime()}_${Math.round(
      Math.random() * 100
    )}`;
    const spawnCallback = vscode.commands.registerCommand(
      spawnCallbackCommandName,
      (eventName: string, payload?: string | Error) => {
        event.emit(eventName, payload);
        if (eventName === 'error' || eventName === 'close') {
          spawnCallback.dispose();
        }
      }
    );

    vscode.commands.executeCommand(
      'iotcube.sshSpawn',
      this._id,
      command,
      spawnCallbackCommandName
    );
    return event;
  }

  async exec(command: string) {
    if (this._id === null) {
      throw new Error(
        'You must open an SSH connection before execute commands.'
      );
    }
    return (await vscode.commands.executeCommand(
      'iotcube.sshExec',
      this._id,
      command
    )) as string;
  }

  async uploadFile(localPath: string, remotePath: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before upload files.');
    }
    const tempFolder = (await vscode.commands.executeCommand(
      'iotcube.fsGetTempDir'
    )) as string;
    await FileSystem.transferFile(localPath, tempFolder);
    const tempFilePath = path.join(tempFolder, path.basename(localPath));

    return (await vscode.commands.executeCommand(
      'iotcube.sshUploadFile',
      this._id,
      tempFilePath,
      remotePath
    )) as void;
  }

  async uploadFolder(localFolderPath: string, remoteFolderPath: string) {
    if (this._id === null) {
      throw new Error('You must open an SSH connection before upload files.');
    }
    return (await vscode.commands.executeCommand(
      'iotcube.sshUploadFolder',
      this._id,
      localFolderPath,
      remoteFolderPath
    )) as void;
  }

  async clipboardCopy(text: string) {
    return (await vscode.commands.executeCommand(
      'iotcube.clipboardCopy',
      text
    )) as void;
  }
}
