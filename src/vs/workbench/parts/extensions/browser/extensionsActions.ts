/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, Action } from 'vs/base/common/actions';
import { Throttler } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import paths = require('vs/base/common/paths');
import Event from 'vs/base/common/event';
import * as json from 'vs/base/common/json';
import { ActionItem, IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { ExtensionsConfigurationInitialContent } from 'vs/workbench/parts/extensions/common/extensionsFileTemplate';
import { LocalExtensionType, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Query } from 'vs/workbench/parts/extensions/common/extensionQuery';
import { IFileService, IContent } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IExtensionService, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import URI from 'vs/base/common/uri';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, registerColor, foreground } from 'vs/platform/theme/common/colorRegistry';
import { Color } from 'vs/base/common/color';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { PICK_WORKSPACE_FOLDER_COMMAND } from 'vs/workbench/browser/actions/workspaceActions';

export class InstallAction extends Action {

	private static InstallLabel = localize('installAction', "Install");
	private static InstallingLabel = localize('installing', "Installing");

	private static Class = 'extension-action prominent install';
	private static InstallingClass = 'extension-action install installing';

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.install', InstallAction.InstallLabel, InstallAction.Class, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension || this.extension.type === LocalExtensionType.System) {
			this.enabled = false;
			this.class = InstallAction.Class;
			this.label = InstallAction.InstallLabel;
			return;
		}

		this.enabled = this.extensionsWorkbenchService.canInstall(this.extension) && this.extension.state === ExtensionState.Uninstalled;

		if (this.extension.state === ExtensionState.Installing) {
			this.label = InstallAction.InstallingLabel;
			this.class = InstallAction.InstallingClass;
		} else {
			this.label = InstallAction.InstallLabel;
			this.class = InstallAction.Class;
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UninstallAction extends Action {

	private static UninstallLabel = localize('uninstallAction', "Uninstall");
	private static UninstallingLabel = localize('Uninstalling', "Uninstalling");

	private static UninstallClass = 'extension-action uninstall';
	private static UnInstallingClass = 'extension-action uninstall uninstalling';

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super('extensions.uninstall', UninstallAction.UninstallLabel, UninstallAction.UninstallClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			return;
		}

		const state = this.extension.state;

		if (state === ExtensionState.Uninstalling) {
			this.label = UninstallAction.UninstallingLabel;
			this.class = UninstallAction.UnInstallingClass;
			this.enabled = false;
			return;
		}

		this.label = UninstallAction.UninstallLabel;
		this.class = UninstallAction.UninstallClass;

		const installedExtensions = this.extensionsWorkbenchService.local.filter(e => e.id === this.extension.id);

		if (!installedExtensions.length) {
			this.enabled = false;
			return;
		}

		if (installedExtensions[0].type !== LocalExtensionType.User) {
			this.enabled = false;
			return;
		}

		this.enabled = true;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.uninstall(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CombinedInstallAction extends Action {

	private static NoExtensionClass = 'extension-action prominent install no-extension';
	private installAction: InstallAction;
	private uninstallAction: UninstallAction;
	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) {
		this._extension = extension;
		this.installAction.extension = extension;
		this.uninstallAction.extension = extension;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.combinedInstall', '', '', false);

		this.installAction = instantiationService.createInstance(InstallAction);
		this.uninstallAction = instantiationService.createInstance(UninstallAction);
		this.disposables.push(this.installAction, this.uninstallAction);

		this.installAction.onDidChange(this.update, this, this.disposables);
		this.uninstallAction.onDidChange(this.update, this, this.disposables);
		this.update();
	}

	private update(): void {
		if (!this.extension || this.extension.type === LocalExtensionType.System) {
			this.enabled = false;
			this.class = CombinedInstallAction.NoExtensionClass;
		} else if (this.installAction.enabled) {
			this.enabled = true;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else if (this.uninstallAction.enabled) {
			this.enabled = true;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
		} else if (this.extension.state === ExtensionState.Installing) {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		} else if (this.extension.state === ExtensionState.Uninstalling) {
			this.enabled = false;
			this.label = this.uninstallAction.label;
			this.class = this.uninstallAction.class;
		} else {
			this.enabled = false;
			this.label = this.installAction.label;
			this.class = this.installAction.class;
		}
	}

	run(): TPromise<any> {
		if (this.installAction.enabled) {
			return this.installAction.run();
		} else if (this.uninstallAction.enabled) {
			return this.uninstallAction.run();
		}

		return TPromise.as(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class UpdateAction extends Action {

	private static EnabledClass = 'extension-action prominent update';
	private static DisabledClass = `${UpdateAction.EnabledClass} disabled`;
	private static Label = localize('updateAction', "Update");

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensions.update', UpdateAction.Label, UpdateAction.DisabledClass, false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = UpdateAction.DisabledClass;
			this.label = UpdateAction.Label;
			return;
		}

		if (this.extension.type !== LocalExtensionType.User) {
			this.enabled = false;
			this.class = UpdateAction.DisabledClass;
			this.label = UpdateAction.Label;
			return;
		}

		const canInstall = this.extensionsWorkbenchService.canInstall(this.extension);
		const isInstalled = this.extension.state === ExtensionState.Installed;

		this.enabled = canInstall && isInstalled && this.extension.outdated;
		this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
		this.label = localize('updateTo', "Update to {0}", this.extension.latestVersion);
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.install(this.extension);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export interface IExtensionAction extends IAction {
	extension: IExtension;
}

export class DropDownMenuActionItem extends ActionItem {

	private disposables: IDisposable[] = [];
	private _extension: IExtension;

	constructor(action: IAction, private menuActionGroups: IExtensionAction[][],
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(null, action, { icon: true, label: true });
		for (const menuActions of menuActionGroups) {
			this.disposables = [...this.disposables, ...menuActions];
		}
	}

	get extension(): IExtension { return this._extension; }

	set extension(extension: IExtension) {
		this._extension = extension;
		for (const menuActions of this.menuActionGroups) {
			for (const menuAction of menuActions) {
				menuAction.extension = extension;
			}
		}
	}

	public showMenu(): void {
		const actions = this.getActions();
		let elementPosition = DOM.getDomNodePagePosition(this.builder.getHTMLElement());
		const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions),
			actionRunner: this.actionRunner
		});
	}

	private getActions(): IAction[] {
		let actions: IAction[] = [];
		const menuActionGroups = this.menuActionGroups.filter(group => group.some(action => action.enabled));
		for (const menuActions of menuActionGroups) {
			actions = [...actions, ...menuActions, new Separator()];
		}
		return actions.length ? actions.slice(0, actions.length - 1) : actions;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ManageExtensionAction extends Action {

	static ID = 'extensions.manage';

	private static Class = 'extension-action manage';
	private static HideManageExtensionClass = `${ManageExtensionAction.Class} hide`;

	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this._actionItem.extension = extension; this.update(); }

	constructor(
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(ManageExtensionAction.ID);

		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [
			[
				instantiationService.createInstance(EnableForWorkspaceAction, localize('enableForWorkspaceAction.label', "Enable (Workspace)")),
				instantiationService.createInstance(EnableGloballyAction, localize('enableAlwaysAction.label', "Enable (Always)"))
			],
			[
				instantiationService.createInstance(DisableForWorkspaceAction, localize('disableForWorkspaceAction.label', "Disable (Workspace)")),
				instantiationService.createInstance(DisableGloballyAction, localize('disableAlwaysAction.label', "Disable (Always)"))
			],
			[
				instantiationService.createInstance(UninstallAction)
			]
		]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.class = ManageExtensionAction.HideManageExtensionClass;
		this.tooltip = '';
		this.enabled = false;
		if (this.extension && this.extension.type !== LocalExtensionType.System) {
			const state = this.extension.state;
			this.enabled = state === ExtensionState.Installed;
			this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
			this.tooltip = state === ExtensionState.Uninstalling ? localize('ManageExtensionAction.uninstallingTooltip', "Uninstalling") : '';
		}
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableForWorkspaceAction extends Action implements IExtensionAction {

	static ID = 'extensions.enableForWorkspace';
	static LABEL = localize('enableForWorkspaceAction', "Workspace");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(EnableForWorkspaceAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.disposables.push(this.workspaceContextService.onDidChangeWorkbenchState(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = !this.extension.disabledGlobally && this.extension.disabledForWorkspace && this.extensionEnablementService.canEnable(this.extension.id);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, true, true);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableGloballyAction extends Action implements IExtensionAction {

	static ID = 'extensions.enableGlobally';
	static LABEL = localize('enableGloballyAction', "Always");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(EnableGloballyAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = this.extension.disabledGlobally && this.extensionEnablementService.canEnable(this.extension.id);
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, true, false);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAction extends Action {

	static ID = 'extensions.enable';
	private static EnabledClass = 'extension-action prominent enable';
	private static DisabledClass = `${EnableAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];

	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this._actionItem.extension = extension; this.update(); }


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(EnableAction.ID, localize('enableAction', "Enable"), EnableAction.DisabledClass, false);

		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [
			[
				instantiationService.createInstance(EnableForWorkspaceAction, EnableForWorkspaceAction.LABEL),
				instantiationService.createInstance(EnableGloballyAction, EnableGloballyAction.LABEL)
			]
		]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = EnableAction.DisabledClass;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.disabledGlobally || this.extension.disabledForWorkspace) && this.extensionEnablementService.canEnable(this.extension.id);
		this.class = this.enabled ? EnableAction.EnabledClass : EnableAction.DisabledClass;
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}

}

export class DisableForWorkspaceAction extends Action implements IExtensionAction {

	static ID = 'extensions.disableForWorkspace';
	static LABEL = localize('disableForWorkspaceAction', "Workspace");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(DisableForWorkspaceAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = false;
		if (this.extension && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			this.enabled = this.extension.type !== LocalExtensionType.System && !this.extension.disabledGlobally && !this.extension.disabledForWorkspace;
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, false, true);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableGloballyAction extends Action implements IExtensionAction {

	static ID = 'extensions.disableGlobally';
	static LABEL = localize('disableGloballyAction', "Always");

	private disposables: IDisposable[] = [];

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor(label: string,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(DisableGloballyAction.ID, label);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.enabled = false;
		if (this.extension) {
			this.enabled = this.extension.type !== LocalExtensionType.System && !this.extension.disabledGlobally && !this.extension.disabledForWorkspace;
		}
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setEnablement(this.extension, false, false);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableAction extends Action {

	static ID = 'extensions.disable';

	private static EnabledClass = 'extension-action disable';
	private static DisabledClass = `${DisableAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];
	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this._actionItem.extension = extension; this.update(); }


	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(DisableAction.ID, localize('disableAction', "Disable"), DisableAction.DisabledClass, false);
		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [
			[
				instantiationService.createInstance(DisableForWorkspaceAction, DisableForWorkspaceAction.LABEL),
				instantiationService.createInstance(DisableGloballyAction, DisableGloballyAction.LABEL)
			]
		]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.extension) {
			this.enabled = false;
			this.class = DisableAction.DisabledClass;
			return;
		}

		this.enabled = this.extension.state === ExtensionState.Installed && this.extension.type !== LocalExtensionType.System && !this.extension.disabledGlobally && !this.extension.disabledForWorkspace;
		this.class = this.enabled ? DisableAction.EnabledClass : DisableAction.DisabledClass;
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class CheckForUpdatesAction extends Action {

	static ID = 'workbench.extensions.action.checkForUpdates';
	static LABEL = localize('checkForUpdates', "Check for Updates");

	constructor(
		id = UpdateAllAction.ID,
		label = UpdateAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, '', true);
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.checkForUpdates();
	}
}

export class ToggleAutoUpdateAction extends Action {

	constructor(
		id: string,
		label: string,
		private autoUpdateValue: boolean,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, '', true);
		this.updateEnablement();
		configurationService.onDidUpdateConfiguration(() => this.updateEnablement());
	}

	private updateEnablement(): void {
		this.enabled = this.extensionsWorkbenchService.isAutoUpdateEnabled !== this.autoUpdateValue;
	}

	run(): TPromise<any> {
		return this.extensionsWorkbenchService.setAutoUpdate(this.autoUpdateValue);
	}
}

export class EnableAutoUpdateAction extends ToggleAutoUpdateAction {

	static ID = 'workbench.extensions.action.enableAutoUpdate';
	static LABEL = localize('enableAutoUpdate', "Enable Auto Updating Extensions");

	constructor(
		id = EnableAutoUpdateAction.ID,
		label = EnableAutoUpdateAction.LABEL,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, true, configurationService, extensionsWorkbenchService);
	}
}

export class DisableAutoUpdateAction extends ToggleAutoUpdateAction {

	static ID = 'workbench.extensions.action.disableAutoUpdate';
	static LABEL = localize('disableAutoUpdate', "Disable Auto Updating Extensions");

	constructor(
		id = EnableAutoUpdateAction.ID,
		label = EnableAutoUpdateAction.LABEL,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, false, configurationService, extensionsWorkbenchService);
	}
}

export class UpdateAllAction extends Action {

	static ID = 'workbench.extensions.action.updateAllExtensions';
	static LABEL = localize('updateAll', "Update All Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id = UpdateAllAction.ID,
		label = UpdateAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, '', false);

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private get outdated(): IExtension[] {
		return this.extensionsWorkbenchService.local.filter(e => e.outdated && e.state !== ExtensionState.Installing);
	}

	private update(): void {
		this.enabled = this.outdated.length > 0;
	}

	run(): TPromise<any> {
		return TPromise.join(this.outdated.map(e => this.extensionsWorkbenchService.install(e)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ReloadAction extends Action {

	private static EnabledClass = 'extension-action reload';
	private static DisabledClass = `${ReloadAction.EnabledClass} disabled`;

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	reloadMessaage: string = '';
	private throttler: Throttler;

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IMessageService private messageService: IMessageService,
		@IWindowService private windowService: IWindowService,
		@IExtensionService private extensionService: IExtensionService
	) {
		super('extensions.reload', localize('reloadAction', "Reload"), ReloadAction.DisabledClass, false);
		this.throttler = new Throttler();

		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.throttler.queue(() => {
			this.enabled = false;
			this.tooltip = '';
			this.reloadMessaage = '';
			if (!this.extension) {
				return TPromise.wrap<void>(null);
			}
			const state = this.extension.state;
			if (state === ExtensionState.Installing || state === ExtensionState.Uninstalling) {
				return TPromise.wrap<void>(null);
			}
			return this.extensionService.getExtensions()
				.then(runningExtensions => this.computeReloadState(runningExtensions));
		}).done(() => {
			this.class = this.enabled ? ReloadAction.EnabledClass : ReloadAction.DisabledClass;
		});
	}

	private computeReloadState(runningExtensions: IExtensionDescription[]): void {
		const isInstalled = this.extensionsWorkbenchService.local.some(e => e.id === this.extension.id);
		const isUninstalled = this.extension.state === ExtensionState.Uninstalled;
		const isDisabled = this.extension.disabledForWorkspace || this.extension.disabledGlobally;

		const filteredExtensions = runningExtensions.filter(e => areSameExtensions(e, this.extension));
		const isExtensionRunning = filteredExtensions.length > 0;
		const isDifferentVersionRunning = filteredExtensions.length > 0 && this.extension.version !== filteredExtensions[0].version;

		if (isInstalled) {
			if (isDifferentVersionRunning && !isDisabled) {
				// Requires reload to run the updated extension
				this.enabled = true;
				this.tooltip = localize('postUpdateTooltip', "Reload to update");
				this.reloadMessaage = localize('postUpdateMessage', "Reload this window to activate the updated extension '{0}'?", this.extension.displayName);
				return;
			}

			if (!isExtensionRunning && !isDisabled) {
				// Requires reload to enable the extension
				this.enabled = true;
				this.tooltip = localize('postEnableTooltip', "Reload to activate");
				this.reloadMessaage = localize('postEnableMessage', "Reload this window to activate the extension '{0}'?", this.extension.displayName);
				return;
			}

			if (isExtensionRunning && isDisabled) {
				// Requires reload to disable the extension
				this.enabled = true;
				this.tooltip = localize('postDisableTooltip', "Reload to deactivate");
				this.reloadMessaage = localize('postDisableMessage', "Reload this window to deactivate the extension '{0}'?", this.extension.displayName);
				return;
			}
			return;
		}

		if (isUninstalled && isExtensionRunning) {
			// Requires reload to deactivate the extension
			this.enabled = true;
			this.tooltip = localize('postUninstallTooltip', "Reload to deactivate");
			this.reloadMessaage = localize('postUninstallMessage', "Reload this window to deactivate the uninstalled extension '{0}'?", this.extension.displayName);
			return;
		}
	}

	run(): TPromise<any> {
		if (this.messageService.confirm({ message: this.reloadMessaage, type: 'question', primaryButton: localize('reload', "&&Reload Window") })) {
			return this.windowService.reloadWindow();
		}
		return TPromise.wrap(null);
	}
}

export class OpenExtensionsViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleExtensionsViewlet', "Show Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

export class InstallExtensionsAction extends OpenExtensionsViewletAction {
	static ID = 'workbench.extensions.action.installExtensions';
	static LABEL = localize('installExtensions', "Install Extensions");
}

export class ShowEnabledExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showEnabledExtensions';
	static LABEL = localize('showEnabledExtensions', 'Show Enabled Extensions');

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, 'clear-extensions', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@enabled');
				viewlet.focus();
			});
	}
}

export class ShowInstalledExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showInstalledExtensions';
	static LABEL = localize('showInstalledExtensions', "Show Installed Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, 'clear-extensions', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@installed');
				viewlet.focus();
			});
	}
}

export class ShowDisabledExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showDisabledExtensions';
	static LABEL = localize('showDisabledExtensions', "Show Disabled Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, 'null', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@disabled ');
				viewlet.focus();
			});
	}
}

export class ClearExtensionsInputAction extends Action {

	static ID = 'workbench.extensions.action.clearExtensionsInput';
	static LABEL = localize('clearExtensionsInput', "Clear Extensions Input");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(id, label, 'clear-extensions', true);
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		this.enabled = !!value;
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('');
				viewlet.focus();
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class ShowOutdatedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.listOutdatedExtensions';
	static LABEL = localize('showOutdatedExtensions', "Show Outdated Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@outdated ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowPopularExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showPopularExtensions';
	static LABEL = localize('showPopularExtensions', "Show Popular Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowRecommendedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showRecommendedExtensions';
	static LABEL = localize('showRecommendedExtensions', "Show Recommended Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowWorkspaceRecommendedExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showWorkspaceRecommendedExtensions';
	static LABEL = localize('showWorkspaceRecommendedExtensions', "Show Workspace Recommended Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null);
		this.contextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended:workspace ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class ShowRecommendedKeymapExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showRecommendedKeymapExtensions';
	static LABEL = localize('showRecommendedKeymapExtensions', "Show Recommended Keymaps");
	static SHORT_LABEL = localize('showRecommendedKeymapExtensionsShort', "Keymaps");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@recommended:keymaps ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowLanguageExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showLanguageExtensions';
	static LABEL = localize('showLanguageExtensions', "Show Language Extensions");
	static SHORT_LABEL = localize('showLanguageExtensionsShort', "Language Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs category:languages ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ShowAzureExtensionsAction extends Action {

	static ID = 'workbench.extensions.action.showAzureExtensions';
	static LABEL = localize('showAzureExtensions', "Show Azure Extensions");
	static SHORT_LABEL = localize('showAzureExtensionsShort', "Azure Extensions");

	constructor(
		id: string,
		label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('@sort:installs azure ');
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

export class ChangeSortAction extends Action {

	private query: Query;
	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		private sortBy: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label, null, true);

		if (sortBy === undefined) {
			throw new Error('bad arguments');
		}

		this.query = Query.parse('');
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		const query = Query.parse(value);
		this.query = new Query(query.value, this.sortBy || query.sortBy);
		this.enabled = value && this.query.isValid() && !this.query.equals(query);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search(this.query.toString());
				viewlet.focus();
			});
	}

	protected isEnabled(): boolean {
		return true;
	}
}

interface IExtensionsContent {
	recommendations: string[];
}

export abstract class AbstractConfigureRecommendedExtensionsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IJSONEditingService private jsonEditingService: IJSONEditingService,
		@ITextModelService private textModelResolverService: ITextModelService
	) {
		super(id, label, null);
	}

	protected openExtensionsFile(extensionsFileResource: URI): TPromise<any> {
		return this.getOrCreateExtensionsFile(extensionsFileResource)
			.then(({ created }) => {
				return this.editorService.openEditor({
					resource: extensionsFileResource,
					options: {
						forceOpen: true,
						pinned: created
					},
				});
			}, error => TPromise.wrapError(new Error(localize('OpenExtensionsFile.failed', "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error))));
	}

	protected openWorkspaceConfigurationFile(workspaceConfigurationFile: URI): TPromise<any> {
		return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile)
			.then(content => this.getSelectionPosition(content))
			.then(selection => this.editorService.openEditor({
				resource: workspaceConfigurationFile,
				options: {
					forceOpen: true,
					selection
				}
			}));
	}

	private getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile: URI): TPromise<IContent> {
		return this.fileService.resolveContent(workspaceConfigurationFile)
			.then(content => {
				const workspaceRecommendations = <IExtensionsContent>json.parse(content.value)['extensions'];
				if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
					return this.jsonEditingService.write(workspaceConfigurationFile, { key: 'extensions', value: { recommendations: [] } }, true)
						.then(() => this.fileService.resolveContent(workspaceConfigurationFile));
				}
				return content;
			});
	}

	private getSelectionPosition(content: IContent): TPromise<ITextEditorSelection> {
		const tree = json.parseTree(content.value);
		const node = json.findNodeAtLocation(tree, ['extensions', 'recommendations']);
		if (node && node.parent.children[1]) {
			const offset = node.parent.children[1].offset;
			return this.textModelResolverService.createModelReference(content.resource)
				.then(reference => {
					const position = reference.object.textEditorModel.getPositionAt(offset);
					reference.dispose();
					return <ITextEditorSelection>{
						startLineNumber: position.lineNumber,
						startColumn: position.column,
						endLineNumber: position.lineNumber,
						endColumn: position.column,
					};
				});
		}
		return TPromise.as(null);
	}

	private getOrCreateExtensionsFile(extensionsFileResource: URI): TPromise<{ created: boolean, extensionsFileResource: URI }> {
		return this.fileService.resolveContent(extensionsFileResource).then(content => {
			return { created: false, extensionsFileResource };
		}, err => {
			return this.fileService.updateContent(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
				return { created: true, extensionsFileResource };
			});
		});
	}
}

export class ConfigureWorkspaceRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static ID = 'workbench.extensions.action.configureWorkspaceRecommendedExtensions';
	static LABEL = localize('configureWorkspaceRecommendedExtensions', "Configure Recommended Extensions (Workspace)");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
		this.contextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	public run(event: any): TPromise<any> {
		switch (this.contextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return this.openExtensionsFile(this.contextService.toResource(paths.join('.vscode', 'extensions.json'), this.contextService.getWorkspace().folders[0]));
			case WorkbenchState.WORKSPACE:
				return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration);
		}
		return TPromise.as(null);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class ConfigureWorkspaceFolderRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static ID = 'workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions';
	static LABEL = localize('configureWorkspaceFolderRecommendedExtensions', "Configure Recommended Extensions (Workspace Folder)");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, label, contextService, fileService, editorService, jsonEditingService, textModelResolverService);
		this.contextService.onDidChangeWorkspaceFolders(() => this.update(), this, this.disposables);
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkspace().folders.length > 0;
	}

	public run(): TPromise<any> {
		return this.commandService.executeCommand<WorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND)
			.then(workspaceFolder => {
				if (workspaceFolder) {
					return this.openExtensionsFile(this.contextService.toResource(paths.join('.vscode', 'extensions.json'), workspaceFolder));
				}
				return null;
			});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class BuiltinStatusLabelAction extends Action {

	private static Class = 'extension-action built-in-status';

	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.update(); }

	constructor() {
		super('extensions.install', localize('builtin', "Built-in"), '', false);
	}

	private update(): void {
		if (this.extension && this.extension.type === LocalExtensionType.System) {
			this.class = `${BuiltinStatusLabelAction.Class} system`;
		} else {
			this.class = `${BuiltinStatusLabelAction.Class} user`;
		}
	}

	run(): TPromise<any> {
		return TPromise.as(null);
	}
}

export class DisableAllAction extends Action {

	static ID = 'workbench.extensions.action.disableAll';
	static LABEL = localize('disableAll', "Disable All Installed Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = DisableAllAction.ID, label: string = DisableAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
	}

	private update(): void {
		this.enabled = this.extensionsWorkbenchService.local.some(e => e.type === LocalExtensionType.User && !e.disabledForWorkspace && !e.disabledGlobally);
	}

	run(): TPromise<any> {
		return TPromise.join(this.extensionsWorkbenchService.local.map(e => this.extensionsWorkbenchService.setEnablement(e, false)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class DisableAllWorkpsaceAction extends Action {

	static ID = 'workbench.extensions.action.disableAllWorkspace';
	static LABEL = localize('disableAllWorkspace', "Disable All Installed Extensions for this Workspace");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = DisableAllWorkpsaceAction.ID, label: string = DisableAllWorkpsaceAction.LABEL,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
		this.extensionsWorkbenchService.onChange(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.extensionsWorkbenchService.local.some(e => e.type === LocalExtensionType.User && !e.disabledForWorkspace && !e.disabledGlobally);
	}

	run(): TPromise<any> {
		return TPromise.join(this.extensionsWorkbenchService.local.map(e => this.extensionsWorkbenchService.setEnablement(e, false, true)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAllAction extends Action {

	static ID = 'workbench.extensions.action.enableAll';
	static LABEL = localize('enableAll', "Enable All Installed Extensions");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = EnableAllAction.ID, label: string = EnableAllAction.LABEL,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.disposables.push(this.extensionsWorkbenchService.onChange(() => this.update()));
	}

	private update(): void {
		this.enabled = this.extensionsWorkbenchService.local.some(e => this.extensionEnablementService.canEnable(e.id) && e.disabledGlobally);
	}

	run(): TPromise<any> {
		return TPromise.join(this.extensionsWorkbenchService.local.map(e => this.extensionsWorkbenchService.setEnablement(e, true)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class EnableAllWorkpsaceAction extends Action {

	static ID = 'workbench.extensions.action.enableAllWorkspace';
	static LABEL = localize('enableAllWorkspace', "Enable All Installed Extensions for this Workspace");

	private disposables: IDisposable[] = [];

	constructor(
		id: string = EnableAllWorkpsaceAction.ID, label: string = EnableAllWorkpsaceAction.LABEL,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService
	) {
		super(id, label);
		this.update();
		this.extensionsWorkbenchService.onChange(() => this.update(), this, this.disposables);
		this.workspaceContextService.onDidChangeWorkbenchState(() => this.update(), this, this.disposables);
	}

	private update(): void {
		this.enabled = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.extensionsWorkbenchService.local.some(e => this.extensionEnablementService.canEnable(e.id) && !e.disabledGlobally && e.disabledForWorkspace);
	}

	run(): TPromise<any> {
		return TPromise.join(this.extensionsWorkbenchService.local.map(e => this.extensionsWorkbenchService.setEnablement(e, true, true)));
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsForLanguage', function (accessor: ServicesAccessor, fileExtension: string) {
	const viewletService = accessor.get(IViewletService);

	return viewletService.openViewlet(VIEWLET_ID, true)
		.then(viewlet => viewlet as IExtensionsViewlet)
		.then(viewlet => {
			viewlet.search(`ext:${fileExtension.replace(/^\./, '')}`);
			viewlet.focus();
		});
});

export const extensionButtonProminentBackground = registerColor('extensionButton.prominentBackground', {
	dark: '#327e36',
	light: '#327e36',
	hc: null
}, localize('extensionButtonProminentBackground', "Button background color for actions extension that stand out (e.g. install button)."));

export const extensionButtonProminentForeground = registerColor('extensionButton.prominentForeground', {
	dark: Color.white,
	light: Color.white,
	hc: null
}, localize('extensionButtonProminentForeground', "Button foreground color for actions extension that stand out (e.g. install button)."));

export const extensionButtonProminentHoverBackground = registerColor('extensionButton.prominentHoverBackground', {
	dark: '#28632b',
	light: '#28632b',
	hc: null
}, localize('extensionButtonProminentHoverBackground', "Button background hover color for actions extension that stand out (e.g. install button)."));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action.built-in-status { border-color: ${foregroundColor}; }`);
	}

	const buttonBackgroundColor = theme.getColor(buttonBackground);
	if (buttonBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action { background-color: ${buttonBackgroundColor}; }`);
	}

	const buttonForegroundColor = theme.getColor(buttonForeground);
	if (buttonForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action { color: ${buttonForegroundColor}; }`);
	}

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item:hover .action-label.extension-action { background-color: ${buttonHoverBackgroundColor}; }`);
	}

	const contrastBorderColor = theme.getColor(contrastBorder);
	if (contrastBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action { border: 1px solid ${contrastBorderColor}; }`);
	}

	const extensionButtonProminentBackgroundColor = theme.getColor(extensionButtonProminentBackground);
	if (extensionButtonProminentBackground) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action.prominent { background-color: ${extensionButtonProminentBackgroundColor}; }`);
	}

	const extensionButtonProminentForegroundColor = theme.getColor(extensionButtonProminentForeground);
	if (extensionButtonProminentForeground) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.extension-action.prominent { color: ${extensionButtonProminentForegroundColor}; }`);
	}

	const extensionButtonProminentHoverBackgroundColor = theme.getColor(extensionButtonProminentHoverBackground);
	if (extensionButtonProminentHoverBackground) {
		collector.addRule(`.monaco-action-bar .action-item:hover .action-label.extension-action.prominent { background-color: ${extensionButtonProminentHoverBackgroundColor}; }`);
	}
});