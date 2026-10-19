import{a as de,b as ue,c as ge,f as pe,i as me,j as Ce,k as Me,l as Se,m as Te,n as Ie}from"./chunk-EGRARLJK.js";import{a as we,c as Ee}from"./chunk-LBMZERIU.js";import{$a as fe,Aa as ie,Ba as re,C as p,Ea as R,Fa as le,G as j,H as s,Ia as V,Ja as g,L as f,M as Q,N as W,S as M,Sa as se,T as S,U as T,Ua as ce,V as U,W as H,X as b,Y as r,Ya as be,Z as l,Za as he,_ as D,ab as G,ca as K,cb as I,e as L,ea as m,fa as h,ga as Z,ha as $,hb as _e,ia as J,ib as ve,ja as X,jb as xe,ka as A,kb as ke,la as B,lb as ye,pa as Y,q as P,qa as x,ra as ee,s as N,sa as c,t as O,ta as _,u,ua as k,v as z,w as q,wa as te,xa as ne,ya as oe,z as C,za as ae}from"./chunk-EHB4Y4YZ.js";var y=class{_multiple;_emitChanges;compareWith;_selection=new Set;_deselectedToEmit=[];_selectedToEmit=[];_selected=null;get selected(){return this._selected||(this._selected=Array.from(this._selection.values())),this._selected}changed=new L;constructor(o=!1,e,n=!0,t){this._multiple=o,this._emitChanges=n,this.compareWith=t,e&&e.length&&(o?e.forEach(i=>this._markSelected(i)):this._markSelected(e[0]),this._selectedToEmit.length=0)}select(...o){this._verifyValueAssignment(o),o.forEach(n=>this._markSelected(n));let e=this._hasQueuedChanges();return this._emitChangeEvent(),e}deselect(...o){this._verifyValueAssignment(o),o.forEach(n=>this._unmarkSelected(n));let e=this._hasQueuedChanges();return this._emitChangeEvent(),e}setSelection(...o){this._verifyValueAssignment(o);let e=this.selected,n=new Set(o.map(i=>this._getConcreteValue(i)));o.forEach(i=>this._markSelected(i)),e.filter(i=>!n.has(this._getConcreteValue(i,n))).forEach(i=>this._unmarkSelected(i));let t=this._hasQueuedChanges();return this._emitChangeEvent(),t}toggle(o){return this.isSelected(o)?this.deselect(o):this.select(o)}clear(o=!0){this._unmarkAll();let e=this._hasQueuedChanges();return o&&this._emitChangeEvent(),e}isSelected(o){return this._selection.has(this._getConcreteValue(o))}isEmpty(){return this._selection.size===0}hasValue(){return!this.isEmpty()}sort(o){this._multiple&&this.selected&&this._selected.sort(o)}isMultipleSelection(){return this._multiple}_emitChangeEvent(){this._selected=null,(this._selectedToEmit.length||this._deselectedToEmit.length)&&(this.changed.next({source:this,added:this._selectedToEmit,removed:this._deselectedToEmit}),this._deselectedToEmit=[],this._selectedToEmit=[])}_markSelected(o){o=this._getConcreteValue(o),this.isSelected(o)||(this._multiple||this._unmarkAll(),this.isSelected(o)||this._selection.add(o),this._emitChanges&&this._selectedToEmit.push(o))}_unmarkSelected(o){o=this._getConcreteValue(o),this.isSelected(o)&&(this._selection.delete(o),this._emitChanges&&this._deselectedToEmit.push(o))}_unmarkAll(){this.isEmpty()||this._selection.forEach(o=>this._unmarkSelected(o))}_verifyValueAssignment(o){o.length>1&&this._multiple}_hasQueuedChanges(){return!!(this._deselectedToEmit.length||this._selectedToEmit.length)}_getConcreteValue(o,e){if(this.compareWith){e=e??this._selection;for(let n of e)if(this.compareWith(o,n))return n;return o}else return o}};var De=(()=>{class a{_animationsDisabled=I();state="unchecked";disabled=!1;appearance="full";constructor(){}static \u0275fac=function(n){return new(n||a)};static \u0275cmp=f({type:a,selectors:[["mat-pseudo-checkbox"]],hostAttrs:[1,"mat-pseudo-checkbox"],hostVars:12,hostBindings:function(n,t){n&2&&x("mat-pseudo-checkbox-indeterminate",t.state==="indeterminate")("mat-pseudo-checkbox-checked",t.state==="checked")("mat-pseudo-checkbox-disabled",t.disabled)("mat-pseudo-checkbox-minimal",t.appearance==="minimal")("mat-pseudo-checkbox-full",t.appearance==="full")("_mat-animation-noopable",t._animationsDisabled)},inputs:{state:"state",disabled:"disabled",appearance:"appearance"},decls:0,vars:0,template:function(n,t){},styles:[`.mat-pseudo-checkbox {
  border-radius: 2px;
  cursor: pointer;
  display: inline-block;
  vertical-align: middle;
  box-sizing: border-box;
  position: relative;
  flex-shrink: 0;
  transition: border-color 90ms cubic-bezier(0, 0, 0.2, 0.1), background-color 90ms cubic-bezier(0, 0, 0.2, 0.1);
}
.mat-pseudo-checkbox::after {
  position: absolute;
  opacity: 0;
  content: "";
  border-bottom: 2px solid currentColor;
  transition: opacity 90ms cubic-bezier(0, 0, 0.2, 0.1);
}
.mat-pseudo-checkbox._mat-animation-noopable {
  transition: none !important;
  animation: none !important;
}
.mat-pseudo-checkbox._mat-animation-noopable::after {
  transition: none;
}

.mat-pseudo-checkbox-disabled {
  cursor: default;
}

.mat-pseudo-checkbox-indeterminate::after {
  left: 1px;
  opacity: 1;
  border-radius: 2px;
}

.mat-pseudo-checkbox-checked::after {
  left: 1px;
  border-left: 2px solid currentColor;
  transform: rotate(-45deg);
  opacity: 1;
  box-sizing: content-box;
}

.mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-checked::after, .mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-indeterminate::after {
  color: var(--mat-pseudo-checkbox-minimal-selected-checkmark-color, var(--mat-sys-primary));
}
.mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-checked.mat-pseudo-checkbox-disabled::after, .mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-indeterminate.mat-pseudo-checkbox-disabled::after {
  color: var(--mat-pseudo-checkbox-minimal-disabled-selected-checkmark-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
}

.mat-pseudo-checkbox-full {
  border-color: var(--mat-pseudo-checkbox-full-unselected-icon-color, var(--mat-sys-on-surface-variant));
  border-width: 2px;
  border-style: solid;
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-disabled {
  border-color: var(--mat-pseudo-checkbox-full-disabled-unselected-icon-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-checked, .mat-pseudo-checkbox-full.mat-pseudo-checkbox-indeterminate {
  background-color: var(--mat-pseudo-checkbox-full-selected-icon-color, var(--mat-sys-primary));
  border-color: transparent;
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-checked::after, .mat-pseudo-checkbox-full.mat-pseudo-checkbox-indeterminate::after {
  color: var(--mat-pseudo-checkbox-full-selected-checkmark-color, var(--mat-sys-on-primary));
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-checked.mat-pseudo-checkbox-disabled, .mat-pseudo-checkbox-full.mat-pseudo-checkbox-indeterminate.mat-pseudo-checkbox-disabled {
  background-color: var(--mat-pseudo-checkbox-full-disabled-selected-icon-color, color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent));
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-checked.mat-pseudo-checkbox-disabled::after, .mat-pseudo-checkbox-full.mat-pseudo-checkbox-indeterminate.mat-pseudo-checkbox-disabled::after {
  color: var(--mat-pseudo-checkbox-full-disabled-selected-checkmark-color, var(--mat-sys-surface));
}

.mat-pseudo-checkbox {
  width: 18px;
  height: 18px;
}

.mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-checked::after {
  width: 14px;
  height: 6px;
  transform-origin: center;
  top: -4.2426406871px;
  left: 0;
  bottom: 0;
  right: 0;
  margin: auto;
}
.mat-pseudo-checkbox-minimal.mat-pseudo-checkbox-indeterminate::after {
  top: 8px;
  width: 16px;
}

.mat-pseudo-checkbox-full.mat-pseudo-checkbox-checked::after {
  width: 10px;
  height: 4px;
  transform-origin: center;
  top: -2.8284271247px;
  left: 0;
  bottom: 0;
  right: 0;
  margin: auto;
}
.mat-pseudo-checkbox-full.mat-pseudo-checkbox-indeterminate::after {
  top: 6px;
  width: 12px;
}
`],encapsulation:2,changeDetection:0})}return a})();var qe=["button"],je=["*"];function Qe(a,o){if(a&1&&(r(0,"div",2),D(1,"mat-pseudo-checkbox",6),l()),a&2){let e=h();s(),b("disabled",e.disabled)}}var Ae=new O("MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS",{providedIn:"root",factory:()=>({hideSingleSelectionIndicator:!1,hideMultipleSelectionIndicator:!1,disabledInteractive:!1})}),Be=new O("MatButtonToggleGroup"),We={provide:de,useExisting:P(()=>F),multi:!0},w=class{source;value;constructor(o,e){this.source=o,this.value=e}},F=(()=>{class a{_changeDetector=u(V);_dir=u(xe,{optional:!0});_multiple=!1;_disabled=!1;_disabledInteractive=!1;_selectionModel;_rawValue;_controlValueAccessorChangeFn=()=>{};_onTouched=()=>{};_buttonToggles;appearance;get name(){return this._name}set name(e){this._name=e,this._markButtonsForCheck()}_name=u(G).getId("mat-button-toggle-group-");vertical=!1;get value(){let e=this._selectionModel?this._selectionModel.selected:[];return this.multiple?e.map(n=>n.value):e[0]?e[0].value:void 0}set value(e){this._setSelectionByValue(e),this.valueChange.emit(this.value)}valueChange=new C;get selected(){let e=this._selectionModel?this._selectionModel.selected:[];return this.multiple?e:e[0]||null}get multiple(){return this._multiple}set multiple(e){this._multiple=e,this._markButtonsForCheck()}get disabled(){return this._disabled}set disabled(e){this._disabled=e,this._markButtonsForCheck()}get disabledInteractive(){return this._disabledInteractive}set disabledInteractive(e){this._disabledInteractive=e,this._markButtonsForCheck()}get dir(){return this._dir&&this._dir.value==="rtl"?"rtl":"ltr"}change=new C;get hideSingleSelectionIndicator(){return this._hideSingleSelectionIndicator}set hideSingleSelectionIndicator(e){this._hideSingleSelectionIndicator=e,this._markButtonsForCheck()}_hideSingleSelectionIndicator;get hideMultipleSelectionIndicator(){return this._hideMultipleSelectionIndicator}set hideMultipleSelectionIndicator(e){this._hideMultipleSelectionIndicator=e,this._markButtonsForCheck()}_hideMultipleSelectionIndicator;constructor(){let e=u(Ae,{optional:!0});this.appearance=e&&e.appearance?e.appearance:"standard",this._hideSingleSelectionIndicator=e?.hideSingleSelectionIndicator??!1,this._hideMultipleSelectionIndicator=e?.hideMultipleSelectionIndicator??!1}ngOnInit(){this._selectionModel=new y(this.multiple,void 0,!1)}ngAfterContentInit(){this._selectionModel.select(...this._buttonToggles.filter(e=>e.checked)),this.multiple||this._initializeTabIndex()}writeValue(e){this.value=e,this._changeDetector.markForCheck()}registerOnChange(e){this._controlValueAccessorChangeFn=e}registerOnTouched(e){this._onTouched=e}setDisabledState(e){this.disabled=e}_keydown(e){if(this.multiple||this.disabled||fe(e))return;let t=e.target.id,i=this._buttonToggles.toArray().findIndex(v=>v.buttonId===t),d=null;switch(e.keyCode){case 32:case 13:d=this._buttonToggles.get(i)||null;break;case 38:d=this._getNextButton(i,-1);break;case 37:d=this._getNextButton(i,this.dir==="ltr"?-1:1);break;case 40:d=this._getNextButton(i,1);break;case 39:d=this._getNextButton(i,this.dir==="ltr"?1:-1);break;default:return}d&&(e.preventDefault(),d._onButtonClick(),d.focus())}_emitChangeEvent(e){let n=new w(e,this.value);this._rawValue=n.value,this._controlValueAccessorChangeFn(n.value),this.change.emit(n)}_syncButtonToggle(e,n,t=!1,i=!1){!this.multiple&&this.selected&&!e.checked&&(this.selected.checked=!1),this._selectionModel?n?this._selectionModel.select(e):this._selectionModel.deselect(e):i=!0,i?Promise.resolve().then(()=>this._updateModelValue(e,t)):this._updateModelValue(e,t)}_isSelected(e){return this._selectionModel&&this._selectionModel.isSelected(e)}_isPrechecked(e){return typeof this._rawValue>"u"?!1:this.multiple&&Array.isArray(this._rawValue)?this._rawValue.some(n=>e.value!=null&&n===e.value):e.value===this._rawValue}_initializeTabIndex(){if(this._buttonToggles.forEach(e=>{e.tabIndex=-1}),this.selected)this.selected.tabIndex=0;else for(let e=0;e<this._buttonToggles.length;e++){let n=this._buttonToggles.get(e);if(!n.disabled){n.tabIndex=0;break}}}_getNextButton(e,n){let t=this._buttonToggles;for(let i=1;i<=t.length;i++){let d=(e+n*i+t.length)%t.length,v=t.get(d);if(v&&!v.disabled)return v}return null}_setSelectionByValue(e){if(this._rawValue=e,!this._buttonToggles)return;let n=this._buttonToggles.toArray();if(this.multiple&&e?(Array.isArray(e),this._clearSelection(),e.forEach(t=>this._selectValue(t,n))):(this._clearSelection(),this._selectValue(e,n)),!this.multiple&&n.every(t=>t.tabIndex===-1)){for(let t of n)if(!t.disabled){t.tabIndex=0;break}}}_clearSelection(){this._selectionModel.clear(),this._buttonToggles.forEach(e=>{e.checked=!1,this.multiple||(e.tabIndex=-1)})}_selectValue(e,n){for(let t of n)if(t.value===e){t.checked=!0,this._selectionModel.select(t),this.multiple||(t.tabIndex=0);break}}_updateModelValue(e,n){n&&this._emitChangeEvent(e),this.valueChange.emit(this.value)}_markButtonsForCheck(){this._buttonToggles?.forEach(e=>e._markForCheck())}static \u0275fac=function(n){return new(n||a)};static \u0275dir=W({type:a,selectors:[["mat-button-toggle-group"]],contentQueries:function(n,t,i){if(n&1&&J(i,E,5),n&2){let d;A(d=B())&&(t._buttonToggles=d)}},hostAttrs:[1,"mat-button-toggle-group"],hostVars:6,hostBindings:function(n,t){n&1&&m("keydown",function(d){return t._keydown(d)}),n&2&&(M("role",t.multiple?"group":"radiogroup")("aria-disabled",t.disabled),x("mat-button-toggle-vertical",t.vertical)("mat-button-toggle-group-appearance-standard",t.appearance==="standard"))},inputs:{appearance:"appearance",name:"name",vertical:[2,"vertical","vertical",g],value:"value",multiple:[2,"multiple","multiple",g],disabled:[2,"disabled","disabled",g],disabledInteractive:[2,"disabledInteractive","disabledInteractive",g],hideSingleSelectionIndicator:[2,"hideSingleSelectionIndicator","hideSingleSelectionIndicator",g],hideMultipleSelectionIndicator:[2,"hideMultipleSelectionIndicator","hideMultipleSelectionIndicator",g]},outputs:{valueChange:"valueChange",change:"change"},exportAs:["matButtonToggleGroup"],features:[ie([We,{provide:Be,useExisting:a}])]})}return a})(),E=(()=>{class a{_changeDetectorRef=u(V);_elementRef=u(j);_focusMonitor=u(be);_idGenerator=u(G);_animationDisabled=I();_checked=!1;ariaLabel;ariaLabelledby=null;_buttonElement;buttonToggleGroup;get buttonId(){return`${this.id}-button`}id;name;value;get tabIndex(){return this._tabIndex()}set tabIndex(e){this._tabIndex.set(e)}_tabIndex;disableRipple=!1;get appearance(){return this.buttonToggleGroup?this.buttonToggleGroup.appearance:this._appearance}set appearance(e){this._appearance=e}_appearance;get checked(){return this.buttonToggleGroup?this.buttonToggleGroup._isSelected(this):this._checked}set checked(e){e!==this._checked&&(this._checked=e,this.buttonToggleGroup&&this.buttonToggleGroup._syncButtonToggle(this,this._checked),this._changeDetectorRef.markForCheck())}get disabled(){return this._disabled||this.buttonToggleGroup&&this.buttonToggleGroup.disabled}set disabled(e){this._disabled=e}_disabled=!1;get disabledInteractive(){return this._disabledInteractive||this.buttonToggleGroup!==null&&this.buttonToggleGroup.disabledInteractive}set disabledInteractive(e){this._disabledInteractive=e}_disabledInteractive;change=new C;constructor(){u(he).load(ve);let e=u(Be,{optional:!0}),n=u(new le("tabindex"),{optional:!0})||"",t=u(Ae,{optional:!0});this._tabIndex=p(parseInt(n)||0),this.buttonToggleGroup=e,this._appearance=t&&t.appearance?t.appearance:"standard",this._disabledInteractive=t?.disabledInteractive??!1}ngOnInit(){let e=this.buttonToggleGroup;this.id=this.id||this._idGenerator.getId("mat-button-toggle-"),e&&(e._isPrechecked(this)?this.checked=!0:e._isSelected(this)!==this._checked&&e._syncButtonToggle(this,this._checked))}ngAfterViewInit(){this._animationDisabled||this._elementRef.nativeElement.classList.add("mat-button-toggle-animations-enabled"),this._focusMonitor.monitor(this._elementRef,!0)}ngOnDestroy(){let e=this.buttonToggleGroup;this._focusMonitor.stopMonitoring(this._elementRef),e&&e._isSelected(this)&&e._syncButtonToggle(this,!1,!1,!0)}focus(e){this._buttonElement.nativeElement.focus(e)}_onButtonClick(){if(this.disabled)return;let e=this.isSingleSelector()?!0:!this._checked;if(e!==this._checked&&(this._checked=e,this.buttonToggleGroup&&(this.buttonToggleGroup._syncButtonToggle(this,this._checked,!0),this.buttonToggleGroup._onTouched())),this.isSingleSelector()){let n=this.buttonToggleGroup._buttonToggles.find(t=>t.tabIndex===0);n&&(n.tabIndex=-1),this.tabIndex=0}this.change.emit(new w(this,this.value))}_markForCheck(){this._changeDetectorRef.markForCheck()}_getButtonName(){return this.isSingleSelector()?this.buttonToggleGroup.name:this.name||null}isSingleSelector(){return this.buttonToggleGroup&&!this.buttonToggleGroup.multiple}static \u0275fac=function(n){return new(n||a)};static \u0275cmp=f({type:a,selectors:[["mat-button-toggle"]],viewQuery:function(n,t){if(n&1&&X(qe,5),n&2){let i;A(i=B())&&(t._buttonElement=i.first)}},hostAttrs:["role","presentation",1,"mat-button-toggle"],hostVars:14,hostBindings:function(n,t){n&1&&m("focus",function(){return t.focus()}),n&2&&(M("aria-label",null)("aria-labelledby",null)("id",t.id)("name",null),x("mat-button-toggle-standalone",!t.buttonToggleGroup)("mat-button-toggle-checked",t.checked)("mat-button-toggle-disabled",t.disabled)("mat-button-toggle-disabled-interactive",t.disabledInteractive)("mat-button-toggle-appearance-standard",t.appearance==="standard"))},inputs:{ariaLabel:[0,"aria-label","ariaLabel"],ariaLabelledby:[0,"aria-labelledby","ariaLabelledby"],id:"id",name:"name",value:"value",tabIndex:"tabIndex",disableRipple:[2,"disableRipple","disableRipple",g],appearance:"appearance",checked:[2,"checked","checked",g],disabled:[2,"disabled","disabled",g],disabledInteractive:[2,"disabledInteractive","disabledInteractive",g]},outputs:{change:"change"},exportAs:["matButtonToggle"],ngContentSelectors:je,decls:7,vars:13,consts:[["button",""],["type","button",1,"mat-button-toggle-button","mat-focus-indicator",3,"click","id","disabled"],[1,"mat-button-toggle-checkbox-wrapper"],[1,"mat-button-toggle-label-content"],[1,"mat-button-toggle-focus-overlay"],["matRipple","",1,"mat-button-toggle-ripple",3,"matRippleTrigger","matRippleDisabled"],["state","checked","aria-hidden","true","appearance","minimal",3,"disabled"]],template:function(n,t){if(n&1&&(Z(),r(0,"button",1,0),m("click",function(){return t._onButtonClick()}),S(2,Qe,2,1,"div",2),r(3,"span",3),$(4),l()(),D(5,"span",4)(6,"span",5)),n&2){let i=Y(1);b("id",t.buttonId)("disabled",t.disabled&&!t.disabledInteractive||null),M("role",t.isSingleSelector()?"radio":"button")("tabindex",t.disabled&&!t.disabledInteractive?-1:t.tabIndex)("aria-pressed",t.isSingleSelector()?null:t.checked)("aria-checked",t.isSingleSelector()?t.checked:null)("name",t._getButtonName())("aria-label",t.ariaLabel)("aria-labelledby",t.ariaLabelledby)("aria-disabled",t.disabled&&t.disabledInteractive?"true":null),s(2),T(t.buttonToggleGroup&&(!t.buttonToggleGroup.multiple&&!t.buttonToggleGroup.hideSingleSelectionIndicator||t.buttonToggleGroup.multiple&&!t.buttonToggleGroup.hideMultipleSelectionIndicator)?2:-1),s(4),b("matRippleTrigger",i)("matRippleDisabled",t.disableRipple||t.disabled)}},dependencies:[_e,De],styles:[`.mat-button-toggle-standalone,
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
`],encapsulation:2,changeDetection:0})}return a})(),Re=(()=>{class a{static \u0275fac=function(n){return new(n||a)};static \u0275mod=Q({type:a});static \u0275inj=N({imports:[ye,E,ke]})}return a})();var He=a=>["/contratos",a],Ke=(a,o)=>o.uid;function Ze(a,o){a&1&&(r(0,"p",1),c(1,"Cargando contratos\u2026"),l())}function $e(a,o){if(a&1){let e=K();r(0,"div",10)(1,"p",13),c(2),l(),r(3,"button",14),m("click",function(){z(e);let t=h();return q(t.cargar())}),c(4,"Intentar de nuevo"),l()()}if(a&2){let e=h();s(2),_(e.error())}}function Je(a,o){a&1&&(r(0,"div",11)(1,"h2"),c(2,"A\xFAn no hay contratos"),l(),r(3,"p",1),c(4,"Aparecen aqu\xED cuando GHL crea un borrador desde el flujo de inscripci\xF3n."),l()())}function Xe(a,o){a&1&&(r(0,"p",1),c(1,"Ning\xFAn contrato coincide con la b\xFAsqueda o el filtro."),l())}function Ye(a,o){if(a&1&&(r(0,"li")(1,"a",15)(2,"span",16)(3,"span",17),c(4),l(),r(5,"span",18),c(6),l()(),r(7,"span",19)(8,"span"),c(9),l(),r(10,"span",20),c(11),l()()()()),a&2){let e=o.$implicit,n=h(2);s(),b("routerLink",re(8,He,e.uid)),s(3),_(e.cliente),s(2),_(e.correo),s(2),ee(ae("estado estado--",e.estado.toLowerCase())),s(),_(n.etiqueta(e.estado)),s(2),_(n.fecha(e.creado_en))}}function et(a,o){if(a&1&&(r(0,"ul",12),U(1,Ye,12,10,"li",null,Ke),l()),a&2){let e=h();s(),H(e.visibles())}}var Ve=class a{api=u(ce);cargando=p(!0);error=p("");contratos=p([]);filtro=p("TODOS");busqueda="";visibles=R(()=>{let o=this.busquedaActual().toLowerCase();return this.contratos().filter(e=>this.filtro()==="TODOS"||e.estado===this.filtro()).filter(e=>o===""||e.cliente.toLowerCase().includes(o)||e.correo.toLowerCase().includes(o))});busquedaActual=p("");conteos=R(()=>{let o=this.contratos(),e=n=>o.filter(t=>t.estado===n).length;return{BORRADOR:e("BORRADOR"),ENVIADO:e("ENVIADO"),FIRMADO:e("FIRMADO")}});etiqueta=we;fecha=Ee;ngOnInit(){this.cargar()}cargar(){this.cargando.set(!0),this.error.set(""),this.api.contratos().subscribe({next:({contratos:o})=>{this.contratos.set(o),this.cargando.set(!1)},error:o=>{this.error.set(o.message),this.cargando.set(!1)}})}alBuscar(o){this.busquedaActual.set(o)}static \u0275fac=function(e){return new(e||a)};static \u0275cmp=f({type:a,selectors:[["app-lista-contratos"]],decls:24,vars:7,consts:[[1,"encabezado"],[1,"suave"],[1,"herramientas"],["appearance","outline",1,"buscar"],["matInput","","type","search","name","busqueda",3,"ngModelChange","ngModel"],["aria-label","Filtrar por estado",1,"filtros",3,"change","value"],["value","TODOS"],["value","BORRADOR"],["value","ENVIADO"],["value","FIRMADO"],[1,"tarjeta"],[1,"tarjeta","vacio"],[1,"lista"],["role","alert",1,"error"],["type","button",1,"reintentar",3,"click"],[1,"fila",3,"routerLink"],[1,"fila__principal"],[1,"fila__nombre"],[1,"fila__correo"],[1,"fila__lateral"],[1,"fila__fecha"]],template:function(e,n){e&1&&(r(0,"div",0)(1,"h1"),c(2,"Contratos"),l(),r(3,"span",1),c(4),l()(),r(5,"div",2)(6,"mat-form-field",3)(7,"mat-label"),c(8,"Buscar por nombre o correo"),l(),r(9,"input",4),oe("ngModelChange",function(i){return ne(n.busqueda,i)||(n.busqueda=i),i}),m("ngModelChange",function(i){return n.alBuscar(i)}),l()(),r(10,"mat-button-toggle-group",5),m("change",function(i){return n.filtro.set(i.value)}),r(11,"mat-button-toggle",6),c(12,"Todos"),l(),r(13,"mat-button-toggle",7),c(14),l(),r(15,"mat-button-toggle",8),c(16),l(),r(17,"mat-button-toggle",9),c(18),l()()(),S(19,Ze,2,0,"p",1)(20,$e,5,1,"div",10)(21,Je,5,0,"div",11)(22,Xe,2,0,"p",1)(23,et,3,0,"ul",12)),e&2&&(s(4),k("",n.contratos().length," en total"),s(5),te("ngModel",n.busqueda),s(),b("value",n.filtro()),s(4),k("Borradores (",n.conteos().BORRADOR,")"),s(2),k("Enviados (",n.conteos().ENVIADO,")"),s(2),k("Firmados (",n.conteos().FIRMADO,")"),s(),T(n.cargando()?19:n.error()?20:n.contratos().length===0?21:n.visibles().length===0?22:23))},dependencies:[me,ue,ge,pe,se,Re,F,E,Se,Me,Ce,Ie,Te],styles:[".encabezado[_ngcontent-%COMP%]{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:8px 0 16px}.herramientas[_ngcontent-%COMP%]{display:grid;gap:8px;margin-bottom:16px}.buscar[_ngcontent-%COMP%]{width:100%}.filtros[_ngcontent-%COMP%]{flex-wrap:wrap}.vacio[_ngcontent-%COMP%]{text-align:left}.reintentar[_ngcontent-%COMP%]{margin-top:8px;min-height:44px;padding:0 16px;border:1px solid var(--color-linea);border-radius:6px;background:#fff;color:var(--color-marca);font:inherit;font-weight:600;cursor:pointer}.lista[_ngcontent-%COMP%]{list-style:none;margin:0;padding:0;background:#fff;border:1px solid var(--color-linea);border-radius:8px;overflow:hidden}.lista[_ngcontent-%COMP%]   li[_ngcontent-%COMP%] + li[_ngcontent-%COMP%]{border-top:1px solid var(--color-linea)}.fila[_ngcontent-%COMP%]{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:64px;padding:12px 16px;color:inherit;text-decoration:none}.fila[_ngcontent-%COMP%]:hover, .fila[_ngcontent-%COMP%]:focus-visible{background:#f0f0f7}.fila__principal[_ngcontent-%COMP%]{display:flex;flex-direction:column;min-width:0}.fila__nombre[_ngcontent-%COMP%]{font-weight:700;color:var(--color-marca);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fila__correo[_ngcontent-%COMP%]{color:var(--color-suave);font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fila__lateral[_ngcontent-%COMP%]{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}.fila__fecha[_ngcontent-%COMP%]{color:var(--color-suave);font-size:13px}.estado[_ngcontent-%COMP%]{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:700;border:1px solid transparent}.estado--borrador[_ngcontent-%COMP%]{background:#fff4e6;color:#8a4a00;border-color:#f5c58a}.estado--enviado[_ngcontent-%COMP%]{background:#e8eaf8;color:var(--color-marca);border-color:#b9bde3}.estado--firmado[_ngcontent-%COMP%]{background:#e6f4ea;color:#1e6b34;border-color:#a7d7b3}.estado--revocada[_ngcontent-%COMP%]{background:#f1f1f4;color:var(--color-suave);border-color:var(--color-linea)}"]})};export{Ve as ListaContratos};
