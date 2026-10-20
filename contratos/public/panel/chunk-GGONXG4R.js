import{a as Ot,c as Bt}from"./chunk-LBMZERIU.js";import{a as _t,e as yt,f as xt,g as kt,h as Mt}from"./chunk-ZSOUL5SY.js";import{a as lt}from"./chunk-ZFSAP263.js";import{A as Ct,D as St,E as wt,g as pt,h as bt,l as mt,n as R,q as ht,r as ft,v as vt,w as Tt,z as It}from"./chunk-2XJARWUD.js";import{a as st,b as dt,e as ct,h as gt,p as ut}from"./chunk-ZON536RG.js";import{$a as tt,Aa as l,B as L,Ba as O,Cb as rt,D as F,E as w,F as c,Fa as H,Ha as b,I as N,Ia as h,J as V,Ja as Q,Ka as W,La as K,Ma as Z,Na as B,O as k,Oa as E,R as p,Sa as $,Ta as A,Ua as J,V as P,Va as d,Wa as f,Xa as x,Za as X,_a as Y,ab as et,ba as s,bb as nt,cb as at,fb as I,gb as ot,ja as M,jb as D,ka as z,kb as u,la as q,ra as T,sa as v,ta as y,wa as j,xa as U,ya as m,yb as it,za as r}from"./chunk-NUJHQUKK.js";var qt=["button"],jt=["*"];function Ut(a,i){if(a&1&&(r(0,"div",2),O(1,"mat-pseudo-checkbox",6),l()),a&2){let t=h();s(),m("disabled",t.disabled)}}var Et=new w("MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS",{providedIn:"root",factory:()=>({hideSingleSelectionIndicator:!1,hideMultipleSelectionIndicator:!1,disabledInteractive:!1})}),At=new w("MatButtonToggleGroup"),Ht={provide:st,useExisting:L(()=>G),multi:!0},C=class{source;value;constructor(i,t){this.source=i,this.value=t}},G=(()=>{class a{_changeDetector=c(D);_dir=c(ht,{optional:!0});_multiple=!1;_disabled=!1;_disabledInteractive=!1;_selectionModel;_rawValue;_controlValueAccessorChangeFn=()=>{};_onTouched=()=>{};_buttonToggles;appearance;get name(){return this._name}set name(t){this._name=t,this._markButtonsForCheck()}_name=c(R).getId("mat-button-toggle-group-");vertical=!1;get value(){let t=this._selectionModel?this._selectionModel.selected:[];return this.multiple?t.map(n=>n.value):t[0]?t[0].value:void 0}set value(t){this._setSelectionByValue(t),this.valueChange.emit(this.value)}valueChange=new k;get selected(){let t=this._selectionModel?this._selectionModel.selected:[];return this.multiple?t:t[0]||null}get multiple(){return this._multiple}set multiple(t){this._multiple=t,this._markButtonsForCheck()}get disabled(){return this._disabled}set disabled(t){this._disabled=t,this._markButtonsForCheck()}get disabledInteractive(){return this._disabledInteractive}set disabledInteractive(t){this._disabledInteractive=t,this._markButtonsForCheck()}get dir(){return this._dir&&this._dir.value==="rtl"?"rtl":"ltr"}change=new k;get hideSingleSelectionIndicator(){return this._hideSingleSelectionIndicator}set hideSingleSelectionIndicator(t){this._hideSingleSelectionIndicator=t,this._markButtonsForCheck()}_hideSingleSelectionIndicator;get hideMultipleSelectionIndicator(){return this._hideMultipleSelectionIndicator}set hideMultipleSelectionIndicator(t){this._hideMultipleSelectionIndicator=t,this._markButtonsForCheck()}_hideMultipleSelectionIndicator;constructor(){let t=c(Et,{optional:!0});this.appearance=t&&t.appearance?t.appearance:"standard",this._hideSingleSelectionIndicator=t?.hideSingleSelectionIndicator??!1,this._hideMultipleSelectionIndicator=t?.hideMultipleSelectionIndicator??!1}ngOnInit(){this._selectionModel=new _t(this.multiple,void 0,!1)}ngAfterContentInit(){this._selectionModel.select(...this._buttonToggles.filter(t=>t.checked)),this.multiple||this._initializeTabIndex()}writeValue(t){this.value=t,this._changeDetector.markForCheck()}registerOnChange(t){this._controlValueAccessorChangeFn=t}registerOnTouched(t){this._onTouched=t}setDisabledState(t){this.disabled=t}_keydown(t){if(this.multiple||this.disabled||mt(t))return;let e=t.target.id,o=this._buttonToggles.toArray().findIndex(_=>_.buttonId===e),g=null;switch(t.keyCode){case 32:case 13:g=this._buttonToggles.get(o)||null;break;case 38:g=this._getNextButton(o,-1);break;case 37:g=this._getNextButton(o,this.dir==="ltr"?-1:1);break;case 40:g=this._getNextButton(o,1);break;case 39:g=this._getNextButton(o,this.dir==="ltr"?1:-1);break;default:return}g&&(t.preventDefault(),g._onButtonClick(),g.focus())}_emitChangeEvent(t){let n=new C(t,this.value);this._rawValue=n.value,this._controlValueAccessorChangeFn(n.value),this.change.emit(n)}_syncButtonToggle(t,n,e=!1,o=!1){!this.multiple&&this.selected&&!t.checked&&(this.selected.checked=!1),this._selectionModel?n?this._selectionModel.select(t):this._selectionModel.deselect(t):o=!0,o?Promise.resolve().then(()=>this._updateModelValue(t,e)):this._updateModelValue(t,e)}_isSelected(t){return this._selectionModel&&this._selectionModel.isSelected(t)}_isPrechecked(t){return typeof this._rawValue>"u"?!1:this.multiple&&Array.isArray(this._rawValue)?this._rawValue.some(n=>t.value!=null&&n===t.value):t.value===this._rawValue}_initializeTabIndex(){if(this._buttonToggles.forEach(t=>{t.tabIndex=-1}),this.selected)this.selected.tabIndex=0;else for(let t=0;t<this._buttonToggles.length;t++){let n=this._buttonToggles.get(t);if(!n.disabled){n.tabIndex=0;break}}}_getNextButton(t,n){let e=this._buttonToggles;for(let o=1;o<=e.length;o++){let g=(t+n*o+e.length)%e.length,_=e.get(g);if(_&&!_.disabled)return _}return null}_setSelectionByValue(t){if(this._rawValue=t,!this._buttonToggles)return;let n=this._buttonToggles.toArray();if(this.multiple&&t?(Array.isArray(t),this._clearSelection(),t.forEach(e=>this._selectValue(e,n))):(this._clearSelection(),this._selectValue(t,n)),!this.multiple&&n.every(e=>e.tabIndex===-1)){for(let e of n)if(!e.disabled){e.tabIndex=0;break}}}_clearSelection(){this._selectionModel.clear(),this._buttonToggles.forEach(t=>{t.checked=!1,this.multiple||(t.tabIndex=-1)})}_selectValue(t,n){for(let e of n)if(e.value===t){e.checked=!0,this._selectionModel.select(e),this.multiple||(e.tabIndex=0);break}}_updateModelValue(t,n){n&&this._emitChangeEvent(t),this.valueChange.emit(this.value)}_markButtonsForCheck(){this._buttonToggles?.forEach(t=>t._markForCheck())}static \u0275fac=function(n){return new(n||a)};static \u0275dir=q({type:a,selectors:[["mat-button-toggle-group"]],contentQueries:function(n,e,o){if(n&1&&K(o,S,5),n&2){let g;B(g=E())&&(e._buttonToggles=g)}},hostAttrs:[1,"mat-button-toggle-group"],hostVars:6,hostBindings:function(n,e){n&1&&b("keydown",function(g){return e._keydown(g)}),n&2&&(T("role",e.multiple?"group":"radiogroup")("aria-disabled",e.disabled),A("mat-button-toggle-vertical",e.vertical)("mat-button-toggle-group-appearance-standard",e.appearance==="standard"))},inputs:{appearance:"appearance",name:"name",vertical:[2,"vertical","vertical",u],value:"value",multiple:[2,"multiple","multiple",u],disabled:[2,"disabled","disabled",u],disabledInteractive:[2,"disabledInteractive","disabledInteractive",u],hideSingleSelectionIndicator:[2,"hideSingleSelectionIndicator","hideSingleSelectionIndicator",u],hideMultipleSelectionIndicator:[2,"hideMultipleSelectionIndicator","hideMultipleSelectionIndicator",u]},outputs:{valueChange:"valueChange",change:"change"},exportAs:["matButtonToggleGroup"],features:[nt([Ht,{provide:At,useExisting:a}])]})}return a})(),S=(()=>{class a{_changeDetectorRef=c(D);_elementRef=c(P);_focusMonitor=c(pt);_idGenerator=c(R);_animationDisabled=vt();_checked=!1;ariaLabel;ariaLabelledby=null;_buttonElement;buttonToggleGroup;get buttonId(){return`${this.id}-button`}id;name;value;get tabIndex(){return this._tabIndex()}set tabIndex(t){this._tabIndex.set(t)}_tabIndex;disableRipple=!1;get appearance(){return this.buttonToggleGroup?this.buttonToggleGroup.appearance:this._appearance}set appearance(t){this._appearance=t}_appearance;get checked(){return this.buttonToggleGroup?this.buttonToggleGroup._isSelected(this):this._checked}set checked(t){t!==this._checked&&(this._checked=t,this.buttonToggleGroup&&this.buttonToggleGroup._syncButtonToggle(this,this._checked),this._changeDetectorRef.markForCheck())}get disabled(){return this._disabled||this.buttonToggleGroup&&this.buttonToggleGroup.disabled}set disabled(t){this._disabled=t}_disabled=!1;get disabledInteractive(){return this._disabledInteractive||this.buttonToggleGroup!==null&&this.buttonToggleGroup.disabledInteractive}set disabledInteractive(t){this._disabledInteractive=t}_disabledInteractive;change=new k;constructor(){c(bt).load(kt);let t=c(At,{optional:!0}),n=c(new ot("tabindex"),{optional:!0})||"",e=c(Et,{optional:!0});this._tabIndex=p(parseInt(n)||0),this.buttonToggleGroup=t,this._appearance=e&&e.appearance?e.appearance:"standard",this._disabledInteractive=e?.disabledInteractive??!1}ngOnInit(){let t=this.buttonToggleGroup;this.id=this.id||this._idGenerator.getId("mat-button-toggle-"),t&&(t._isPrechecked(this)?this.checked=!0:t._isSelected(this)!==this._checked&&t._syncButtonToggle(this,this._checked))}ngAfterViewInit(){this._animationDisabled||this._elementRef.nativeElement.classList.add("mat-button-toggle-animations-enabled"),this._focusMonitor.monitor(this._elementRef,!0)}ngOnDestroy(){let t=this.buttonToggleGroup;this._focusMonitor.stopMonitoring(this._elementRef),t&&t._isSelected(this)&&t._syncButtonToggle(this,!1,!1,!0)}focus(t){this._buttonElement.nativeElement.focus(t)}_onButtonClick(){if(this.disabled)return;let t=this.isSingleSelector()?!0:!this._checked;if(t!==this._checked&&(this._checked=t,this.buttonToggleGroup&&(this.buttonToggleGroup._syncButtonToggle(this,this._checked,!0),this.buttonToggleGroup._onTouched())),this.isSingleSelector()){let n=this.buttonToggleGroup._buttonToggles.find(e=>e.tabIndex===0);n&&(n.tabIndex=-1),this.tabIndex=0}this.change.emit(new C(this,this.value))}_markForCheck(){this._changeDetectorRef.markForCheck()}_getButtonName(){return this.isSingleSelector()?this.buttonToggleGroup.name:this.name||null}isSingleSelector(){return this.buttonToggleGroup&&!this.buttonToggleGroup.multiple}static \u0275fac=function(n){return new(n||a)};static \u0275cmp=M({type:a,selectors:[["mat-button-toggle"]],viewQuery:function(n,e){if(n&1&&Z(qt,5),n&2){let o;B(o=E())&&(e._buttonElement=o.first)}},hostAttrs:["role","presentation",1,"mat-button-toggle"],hostVars:14,hostBindings:function(n,e){n&1&&b("focus",function(){return e.focus()}),n&2&&(T("aria-label",null)("aria-labelledby",null)("id",e.id)("name",null),A("mat-button-toggle-standalone",!e.buttonToggleGroup)("mat-button-toggle-checked",e.checked)("mat-button-toggle-disabled",e.disabled)("mat-button-toggle-disabled-interactive",e.disabledInteractive)("mat-button-toggle-appearance-standard",e.appearance==="standard"))},inputs:{ariaLabel:[0,"aria-label","ariaLabel"],ariaLabelledby:[0,"aria-labelledby","ariaLabelledby"],id:"id",name:"name",value:"value",tabIndex:"tabIndex",disableRipple:[2,"disableRipple","disableRipple",u],appearance:"appearance",checked:[2,"checked","checked",u],disabled:[2,"disabled","disabled",u],disabledInteractive:[2,"disabledInteractive","disabledInteractive",u]},outputs:{change:"change"},exportAs:["matButtonToggle"],ngContentSelectors:jt,decls:7,vars:13,consts:[["button",""],["type","button",1,"mat-button-toggle-button","mat-focus-indicator",3,"click","id","disabled"],[1,"mat-button-toggle-checkbox-wrapper"],[1,"mat-button-toggle-label-content"],[1,"mat-button-toggle-focus-overlay"],["matRipple","",1,"mat-button-toggle-ripple",3,"matRippleTrigger","matRippleDisabled"],["state","checked","aria-hidden","true","appearance","minimal",3,"disabled"]],template:function(n,e){if(n&1&&(Q(),r(0,"button",1,0),b("click",function(){return e._onButtonClick()}),v(2,Ut,2,1,"div",2),r(3,"span",3),W(4),l()(),O(5,"span",4)(6,"span",5)),n&2){let o=$(1);m("id",e.buttonId)("disabled",e.disabled&&!e.disabledInteractive||null),T("role",e.isSingleSelector()?"radio":"button")("tabindex",e.disabled&&!e.disabledInteractive?-1:e.tabIndex)("aria-pressed",e.isSingleSelector()?null:e.checked)("aria-checked",e.isSingleSelector()?e.checked:null)("name",e._getButtonName())("aria-label",e.ariaLabel)("aria-labelledby",e.ariaLabelledby)("aria-disabled",e.disabled&&e.disabledInteractive?"true":null),s(2),y(e.buttonToggleGroup&&(!e.buttonToggleGroup.multiple&&!e.buttonToggleGroup.hideSingleSelectionIndicator||e.buttonToggleGroup.multiple&&!e.buttonToggleGroup.hideMultipleSelectionIndicator)?2:-1),s(4),m("matRippleTrigger",o)("matRippleDisabled",e.disableRipple||e.disabled)}},dependencies:[yt,xt],styles:[`.mat-button-toggle-standalone,
.mat-button-toggle-group {
  position: relative;
  display: inline-flex;
  flex-direction: row;
  white-space: nowrap;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  border-radius: var(--mat-button-toggle-legacy-shape);
  transform: translateZ(0);
}
.mat-button-toggle-standalone:not([class*=mat-elevation-z]),
.mat-button-toggle-group:not([class*=mat-elevation-z]) {
  box-shadow: 0px 3px 1px -2px rgba(0, 0, 0, 0.2), 0px 2px 2px 0px rgba(0, 0, 0, 0.14), 0px 1px 5px 0px rgba(0, 0, 0, 0.12);
}
@media (forced-colors: active) {
  .mat-button-toggle-standalone,
  .mat-button-toggle-group {
    outline: solid 1px;
  }
}

.mat-button-toggle-standalone.mat-button-toggle-appearance-standard,
.mat-button-toggle-group-appearance-standard {
  border-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
  border: solid 1px var(--mat-button-toggle-divider-color, var(--mat-sys-outline));
}
.mat-button-toggle-standalone.mat-button-toggle-appearance-standard .mat-pseudo-checkbox,
.mat-button-toggle-group-appearance-standard .mat-pseudo-checkbox {
  --mat-pseudo-checkbox-minimal-selected-checkmark-color: var(--mat-button-toggle-selected-state-text-color, var(--mat-sys-on-secondary-container));
}
.mat-button-toggle-standalone.mat-button-toggle-appearance-standard:not([class*=mat-elevation-z]),
.mat-button-toggle-group-appearance-standard:not([class*=mat-elevation-z]) {
  box-shadow: none;
}
@media (forced-colors: active) {
  .mat-button-toggle-standalone.mat-button-toggle-appearance-standard,
  .mat-button-toggle-group-appearance-standard {
    outline: 0;
  }
}

.mat-button-toggle-vertical {
  flex-direction: column;
}
.mat-button-toggle-vertical .mat-button-toggle-label-content {
  display: block;
}

.mat-button-toggle {
  white-space: nowrap;
  position: relative;
  color: var(--mat-button-toggle-legacy-text-color);
  font-family: var(--mat-button-toggle-legacy-label-text-font);
  font-size: var(--mat-button-toggle-legacy-label-text-size);
  line-height: var(--mat-button-toggle-legacy-label-text-line-height);
  font-weight: var(--mat-button-toggle-legacy-label-text-weight);
  letter-spacing: var(--mat-button-toggle-legacy-label-text-tracking);
  --mat-pseudo-checkbox-minimal-selected-checkmark-color: var(--mat-button-toggle-legacy-selected-state-text-color);
}
.mat-button-toggle.cdk-keyboard-focused .mat-button-toggle-focus-overlay {
  opacity: var(--mat-button-toggle-legacy-focus-state-layer-opacity);
}
.mat-button-toggle .mat-icon svg {
  vertical-align: top;
}

.mat-button-toggle-checkbox-wrapper {
  display: inline-block;
  justify-content: flex-start;
  align-items: center;
  width: 0;
  height: 18px;
  line-height: 18px;
  overflow: hidden;
  box-sizing: border-box;
  position: absolute;
  top: 50%;
  left: 16px;
  transform: translate3d(0, -50%, 0);
}
[dir=rtl] .mat-button-toggle-checkbox-wrapper {
  left: auto;
  right: 16px;
}
.mat-button-toggle-appearance-standard .mat-button-toggle-checkbox-wrapper {
  left: 12px;
}
[dir=rtl] .mat-button-toggle-appearance-standard .mat-button-toggle-checkbox-wrapper {
  left: auto;
  right: 12px;
}
.mat-button-toggle-checked .mat-button-toggle-checkbox-wrapper {
  width: 18px;
}
.mat-button-toggle-animations-enabled .mat-button-toggle-checkbox-wrapper {
  transition: width 150ms 45ms cubic-bezier(0.4, 0, 0.2, 1);
}
.mat-button-toggle-vertical .mat-button-toggle-checkbox-wrapper {
  transition: none;
}

.mat-button-toggle-checked {
  color: var(--mat-button-toggle-legacy-selected-state-text-color);
  background-color: var(--mat-button-toggle-legacy-selected-state-background-color);
}

.mat-button-toggle-disabled {
  pointer-events: none;
  color: var(--mat-button-toggle-legacy-disabled-state-text-color);
  background-color: var(--mat-button-toggle-legacy-disabled-state-background-color);
  --mat-pseudo-checkbox-minimal-disabled-selected-checkmark-color: var(--mat-button-toggle-legacy-disabled-state-text-color);
}
.mat-button-toggle-disabled.mat-button-toggle-checked {
  background-color: var(--mat-button-toggle-legacy-disabled-selected-state-background-color);
}

.mat-button-toggle-disabled-interactive {
  pointer-events: auto;
}

.mat-button-toggle-appearance-standard {
  color: var(--mat-button-toggle-text-color, var(--mat-sys-on-surface));
  background-color: var(--mat-button-toggle-background-color, transparent);
  font-family: var(--mat-button-toggle-label-text-font, var(--mat-sys-label-large-font));
  font-size: var(--mat-button-toggle-label-text-size, var(--mat-sys-label-large-size));
  line-height: var(--mat-button-toggle-label-text-line-height, var(--mat-sys-label-large-line-height));
  font-weight: var(--mat-button-toggle-label-text-weight, var(--mat-sys-label-large-weight));
  letter-spacing: var(--mat-button-toggle-label-text-tracking, var(--mat-sys-label-large-tracking));
}
.mat-button-toggle-group-appearance-standard .mat-button-toggle-appearance-standard + .mat-button-toggle-appearance-standard {
  border-left: solid 1px var(--mat-button-toggle-divider-color, var(--mat-sys-outline));
}
[dir=rtl] .mat-button-toggle-group-appearance-standard .mat-button-toggle-appearance-standard + .mat-button-toggle-appearance-standard {
  border-left: none;
  border-right: solid 1px var(--mat-button-toggle-divider-color, var(--mat-sys-outline));
}
.mat-button-toggle-group-appearance-standard.mat-button-toggle-vertical .mat-button-toggle-appearance-standard + .mat-button-toggle-appearance-standard {
  border-left: none;
  border-right: none;
  border-top: solid 1px var(--mat-button-toggle-divider-color, var(--mat-sys-outline));
}
.mat-button-toggle-appearance-standard.mat-button-toggle-checked {
  color: var(--mat-button-toggle-selected-state-text-color, var(--mat-sys-on-secondary-container));
  background-color: var(--mat-button-toggle-selected-state-background-color, var(--mat-sys-secondary-container));
}
.mat-button-toggle-appearance-standard.mat-button-toggle-disabled {
  color: var(--mat-button-toggle-disabled-state-text-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
  background-color: var(--mat-button-toggle-disabled-state-background-color, transparent);
}
.mat-button-toggle-appearance-standard.mat-button-toggle-disabled .mat-pseudo-checkbox {
  --mat-pseudo-checkbox-minimal-disabled-selected-checkmark-color: var(--mat-button-toggle-disabled-selected-state-text-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
}
.mat-button-toggle-appearance-standard.mat-button-toggle-disabled.mat-button-toggle-checked {
  color: var(--mat-button-toggle-disabled-selected-state-text-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
  background-color: var(--mat-button-toggle-disabled-selected-state-background-color, color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent));
}
.mat-button-toggle-appearance-standard .mat-button-toggle-focus-overlay {
  background-color: var(--mat-button-toggle-state-layer-color, var(--mat-sys-on-surface));
}
.mat-button-toggle-appearance-standard:hover .mat-button-toggle-focus-overlay {
  opacity: var(--mat-button-toggle-hover-state-layer-opacity, var(--mat-sys-hover-state-layer-opacity));
}
.mat-button-toggle-appearance-standard.cdk-keyboard-focused .mat-button-toggle-focus-overlay {
  opacity: var(--mat-button-toggle-focus-state-layer-opacity, var(--mat-sys-focus-state-layer-opacity));
}
@media (hover: none) {
  .mat-button-toggle-appearance-standard:hover .mat-button-toggle-focus-overlay {
    display: none;
  }
}

.mat-button-toggle-label-content {
  -webkit-user-select: none;
  user-select: none;
  display: inline-block;
  padding: 0 16px;
  line-height: var(--mat-button-toggle-legacy-height);
  position: relative;
}
.mat-button-toggle-appearance-standard .mat-button-toggle-label-content {
  padding: 0 12px;
  line-height: var(--mat-button-toggle-height, 40px);
}

.mat-button-toggle-label-content > * {
  vertical-align: middle;
}

.mat-button-toggle-focus-overlay {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  position: absolute;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  background-color: var(--mat-button-toggle-legacy-state-layer-color);
}

@media (forced-colors: active) {
  .mat-button-toggle-checked .mat-button-toggle-focus-overlay {
    border-bottom: solid 500px;
    opacity: 0.5;
    height: 0;
  }
  .mat-button-toggle-checked:hover .mat-button-toggle-focus-overlay {
    opacity: 0.6;
  }
  .mat-button-toggle-checked.mat-button-toggle-appearance-standard .mat-button-toggle-focus-overlay {
    border-bottom: solid 500px;
  }
}
.mat-button-toggle .mat-button-toggle-ripple {
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  position: absolute;
  pointer-events: none;
}

.mat-button-toggle-button {
  border: 0;
  background: none;
  color: inherit;
  padding: 0;
  margin: 0;
  font: inherit;
  outline: none;
  width: 100%;
  cursor: pointer;
}
.mat-button-toggle-animations-enabled .mat-button-toggle-button {
  transition: padding 150ms 45ms cubic-bezier(0.4, 0, 0.2, 1);
}
.mat-button-toggle-vertical .mat-button-toggle-button {
  transition: none;
}
.mat-button-toggle-disabled .mat-button-toggle-button {
  cursor: default;
}
.mat-button-toggle-button::-moz-focus-inner {
  border: 0;
}
.mat-button-toggle-checked .mat-button-toggle-button:has(.mat-button-toggle-checkbox-wrapper) {
  padding-left: 30px;
}
[dir=rtl] .mat-button-toggle-checked .mat-button-toggle-button:has(.mat-button-toggle-checkbox-wrapper) {
  padding-left: 0;
  padding-right: 30px;
}

.mat-button-toggle-standalone.mat-button-toggle-appearance-standard {
  --mat-focus-indicator-border-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
}

.mat-button-toggle-group-appearance-standard:not(.mat-button-toggle-vertical) .mat-button-toggle:last-of-type .mat-button-toggle-button::before {
  border-top-right-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
  border-bottom-right-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
}
.mat-button-toggle-group-appearance-standard:not(.mat-button-toggle-vertical) .mat-button-toggle:first-of-type .mat-button-toggle-button::before {
  border-top-left-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
  border-bottom-left-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
}

.mat-button-toggle-group-appearance-standard.mat-button-toggle-vertical .mat-button-toggle:last-of-type .mat-button-toggle-button::before {
  border-bottom-right-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
  border-bottom-left-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
}
.mat-button-toggle-group-appearance-standard.mat-button-toggle-vertical .mat-button-toggle:first-of-type .mat-button-toggle-button::before {
  border-top-right-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
  border-top-left-radius: var(--mat-button-toggle-shape, var(--mat-sys-corner-extra-large));
}
`],encapsulation:2,changeDetection:0})}return a})(),Dt=(()=>{class a{static \u0275fac=function(n){return new(n||a)};static \u0275mod=z({type:a});static \u0275inj=F({imports:[Mt,S,ft]})}return a})();var Wt=a=>["/contratos",a],Kt=(a,i)=>i.uid;function Zt(a,i){a&1&&(r(0,"a",3),d(1,"Nuevo convenio"),l())}function $t(a,i){a&1&&(r(0,"p",2),d(1,"Cargando contratos\u2026"),l())}function Jt(a,i){if(a&1){let t=H();r(0,"div",12)(1,"p",15),d(2),l(),r(3,"button",16),b("click",function(){N(t);let e=h();return V(e.cargar())}),d(4,"Intentar de nuevo"),l()()}if(a&2){let t=h();s(2),f(t.error())}}function Xt(a,i){a&1&&(r(0,"div",13)(1,"h2"),d(2,"A\xFAn no hay contratos"),l(),r(3,"p",2),d(4,"Crea el primero con \xABNuevo convenio\xBB y elige un contacto de AGORA."),l()())}function Yt(a,i){a&1&&(r(0,"p",2),d(1,"Ning\xFAn contrato coincide con la b\xFAsqueda o el filtro."),l())}function te(a,i){if(a&1&&(r(0,"li")(1,"a",17)(2,"span",18)(3,"span",19),d(4),l(),r(5,"span",20),d(6),l()(),r(7,"span",21)(8,"span"),d(9),l(),r(10,"span",22),d(11),l()()()()),a&2){let t=i.$implicit,n=h(2);s(),m("routerLink",at(8,Wt,t.uid)),s(3),f(t.cliente),s(2),f(t.correo),s(2),J(et("estado estado--",t.estado.toLowerCase())),s(),f(n.etiqueta(t.estado)),s(2),f(n.fecha(t.creado_en))}}function ee(a,i){if(a&1&&(r(0,"ul",14),j(1,te,12,10,"li",null,Kt),l()),a&2){let t=h();s(),U(t.visibles())}}var Rt=class a{api=c(rt);sesion=c(lt);puedeActuar=I(()=>this.sesion.usuario()?.rol!=="VISOR");cargando=p(!0);error=p("");contratos=p([]);filtro=p("TODOS");busqueda="";visibles=I(()=>{let i=this.busquedaActual().toLowerCase();return this.contratos().filter(t=>this.filtro()==="TODOS"||t.estado===this.filtro()).filter(t=>i===""||t.cliente.toLowerCase().includes(i)||t.correo.toLowerCase().includes(i))});busquedaActual=p("");conteos=I(()=>{let i=this.contratos(),t=n=>i.filter(e=>e.estado===n).length;return{BORRADOR:t("BORRADOR"),ENVIADO:t("ENVIADO"),FIRMADO:t("FIRMADO")}});etiqueta=Ot;fecha=Bt;ngOnInit(){this.cargar()}cargar(){this.cargando.set(!0),this.error.set(""),this.api.contratos().subscribe({next:({contratos:i})=>{this.contratos.set(i),this.cargando.set(!1)},error:i=>{this.error.set(i.message),this.cargando.set(!1)}})}alBuscar(i){this.busquedaActual.set(i)}static \u0275fac=function(t){return new(t||a)};static \u0275cmp=M({type:a,selectors:[["app-lista-contratos"]],decls:26,vars:8,consts:[[1,"encabezado"],[1,"encabezado__acciones"],[1,"suave"],["routerLink","/contratos/nuevo",1,"nuevo"],[1,"herramientas"],["appearance","outline",1,"buscar"],["matInput","","type","search","name","busqueda",3,"ngModelChange","ngModel"],["aria-label","Filtrar por estado",1,"filtros",3,"change","value"],["value","TODOS"],["value","BORRADOR"],["value","ENVIADO"],["value","FIRMADO"],[1,"tarjeta"],[1,"tarjeta","vacio"],[1,"lista"],["role","alert",1,"error"],["type","button",1,"reintentar",3,"click"],[1,"fila",3,"routerLink"],[1,"fila__principal"],[1,"fila__nombre"],[1,"fila__correo"],[1,"fila__lateral"],[1,"fila__fecha"]],template:function(t,n){t&1&&(r(0,"div",0)(1,"h1"),d(2,"Contratos"),l(),r(3,"div",1)(4,"span",2),d(5),l(),v(6,Zt,2,0,"a",3),l()(),r(7,"div",4)(8,"mat-form-field",5)(9,"mat-label"),d(10,"Buscar por nombre o correo"),l(),r(11,"input",6),tt("ngModelChange",function(o){return Y(n.busqueda,o)||(n.busqueda=o),o}),b("ngModelChange",function(o){return n.alBuscar(o)}),l()(),r(12,"mat-button-toggle-group",7),b("change",function(o){return n.filtro.set(o.value)}),r(13,"mat-button-toggle",8),d(14,"Todos"),l(),r(15,"mat-button-toggle",9),d(16),l(),r(17,"mat-button-toggle",10),d(18),l(),r(19,"mat-button-toggle",11),d(20),l()()(),v(21,$t,2,0,"p",2)(22,Jt,5,1,"div",12)(23,Xt,5,0,"div",13)(24,Yt,2,0,"p",2)(25,ee,3,0,"ul",14)),t&2&&(s(5),x("",n.contratos().length," en total"),s(),y(n.puedeActuar()?6:-1),s(5),X("ngModel",n.busqueda),s(),m("value",n.filtro()),s(4),x("Borradores (",n.conteos().BORRADOR,")"),s(2),x("Enviados (",n.conteos().ENVIADO,")"),s(2),x("Firmados (",n.conteos().FIRMADO,")"),s(),y(n.cargando()?21:n.error()?22:n.contratos().length===0?23:n.visibles().length===0?24:25))},dependencies:[ut,dt,ct,gt,it,Dt,G,S,Ct,It,Tt,wt,St],styles:[".encabezado[_ngcontent-%COMP%]{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 0 16px}.herramientas[_ngcontent-%COMP%]{display:grid;gap:8px;margin-bottom:16px}.buscar[_ngcontent-%COMP%]{width:100%}.filtros[_ngcontent-%COMP%]{flex-wrap:wrap}.vacio[_ngcontent-%COMP%]{text-align:left}.lista[_ngcontent-%COMP%]{list-style:none;margin:0;padding:0;background:#fff;border:1px solid var(--color-linea);border-radius:8px;overflow:hidden}.lista[_ngcontent-%COMP%]   li[_ngcontent-%COMP%] + li[_ngcontent-%COMP%]{border-top:1px solid var(--color-linea)}.fila[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:64px;padding:12px 16px;color:inherit;text-decoration:none}.fila[_ngcontent-%COMP%]:hover, .fila[_ngcontent-%COMP%]:focus-visible{background:#f0f0f7}.fila__principal[_ngcontent-%COMP%]{display:flex;flex-direction:column;min-width:0}.fila__nombre[_ngcontent-%COMP%]{font-weight:700;color:var(--color-marca);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fila__correo[_ngcontent-%COMP%]{color:var(--color-suave);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fila__lateral[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}.fila__fecha[_ngcontent-%COMP%]{color:var(--color-suave);font-size:13px}.encabezado__acciones[_ngcontent-%COMP%]{display:flex;align-items:center;gap:12px}"]})};export{Rt as ListaContratos};
