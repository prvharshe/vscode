/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from './extHostTypes';
import { parse } from 'vs/base/common/glob';
import { Uri, FileSystemWatcher as _FileSystemWatcher, WorkspaceFolder } from 'vscode';
import { FileSystemEvents, ExtHostFileSystemEventServiceShape } from './extHost.protocol';
import { isEqualOrParent } from 'vs/base/common/paths';

class FileSystemWatcher implements _FileSystemWatcher {

	private _onDidCreate = new Emitter<Uri>();
	private _onDidChange = new Emitter<Uri>();
	private _onDidDelete = new Emitter<Uri>();
	private _disposable: Disposable;
	private _config: number;

	get ignoreCreateEvents(): boolean {
		return Boolean(this._config & 0b001);
	}

	get ignoreChangeEvents(): boolean {
		return Boolean(this._config & 0b010);
	}

	get ignoreDeleteEvents(): boolean {
		return Boolean(this._config & 0b100);
	}

	constructor(dispatcher: Event<FileSystemEvents>, globPattern: string, folder?: WorkspaceFolder, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean) {
		this._config = 0;
		if (ignoreCreateEvents) {
			this._config += 0b001;
		}
		if (ignoreChangeEvents) {
			this._config += 0b010;
		}
		if (ignoreDeleteEvents) {
			this._config += 0b100;
		}

		const parsedPattern = parse(globPattern);

		let subscription = dispatcher(events => {
			if (!ignoreCreateEvents) {
				for (let created of events.created) {
					if (this.matchFolderCondition(created, folder) && parsedPattern(created.fsPath)) {
						this._onDidCreate.fire(created);
					}
				}
			}
			if (!ignoreChangeEvents) {
				for (let changed of events.changed) {
					if (this.matchFolderCondition(changed, folder) && parsedPattern(changed.fsPath)) {
						this._onDidChange.fire(changed);
					}
				}
			}
			if (!ignoreDeleteEvents) {
				for (let deleted of events.deleted) {
					if (this.matchFolderCondition(deleted, folder) && parsedPattern(deleted.fsPath)) {
						this._onDidDelete.fire(deleted);
					}
				}
			}
		});

		this._disposable = Disposable.from(this._onDidCreate, this._onDidChange, this._onDidDelete, subscription);
	}

	matchFolderCondition(resource: Uri, folder?: WorkspaceFolder): boolean {
		if (!folder) {
			return true; // if folder not provided, always match condition
		}

		return isEqualOrParent(resource.fsPath, folder.uri.fsPath); // ensure resource is child of folder
	}

	dispose() {
		this._disposable.dispose();
	}

	get onDidCreate(): Event<Uri> {
		return this._onDidCreate.event;
	}

	get onDidChange(): Event<Uri> {
		return this._onDidChange.event;
	}

	get onDidDelete(): Event<Uri> {
		return this._onDidDelete.event;
	}
}

export class ExtHostFileSystemEventService implements ExtHostFileSystemEventServiceShape {

	private _emitter = new Emitter<FileSystemEvents>();

	constructor() {
	}

	public createFileSystemWatcher(folder: WorkspaceFolder, globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): _FileSystemWatcher;
	public createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): _FileSystemWatcher;
	public createFileSystemWatcher(folderOrGlobPattern: WorkspaceFolder | string, globPatternOrIgnoreCreate?: string | boolean, ignoreCreateOrChange?: boolean, ignoreChangeOrDelete?: boolean, ignoreDelete?: boolean): _FileSystemWatcher {
		let workspaceFolder: WorkspaceFolder;
		let globPattern: string;
		let ignoreCreateEvents: boolean;
		let ignoreChangeEvents: boolean;
		let ignoreDeleteEvents: boolean;

		// No workspace folder provided
		if (typeof folderOrGlobPattern === 'string' && typeof globPatternOrIgnoreCreate !== 'string') {
			globPattern = folderOrGlobPattern;
			ignoreCreateEvents = globPatternOrIgnoreCreate;
			ignoreChangeEvents = ignoreCreateOrChange;
			ignoreDeleteEvents = ignoreChangeOrDelete;
		}

		// Workspace folder provided
		else if (typeof folderOrGlobPattern !== 'string' && typeof globPatternOrIgnoreCreate === 'string') {
			workspaceFolder = folderOrGlobPattern;
			globPattern = globPatternOrIgnoreCreate;
			ignoreCreateEvents = ignoreCreateOrChange;
			ignoreChangeEvents = ignoreChangeOrDelete;
			ignoreDeleteEvents = ignoreDelete;
		}

		return new FileSystemWatcher(this._emitter.event, globPattern, workspaceFolder, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
	}

	$onFileEvent(events: FileSystemEvents) {
		this._emitter.fire(events);
	}
}
