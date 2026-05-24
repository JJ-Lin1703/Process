import BpmnModeler from 'bpmn-js/lib/Modeler.js';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';
import camundaModdleDesc from 'camunda-bpmn-moddle/resources/camunda.json';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';

import { bpmnInstances, globalState } from './config.js';

// 销毁 BPMN 实例
export function destroyBpmnViewer(viewer) {
  if (viewer && typeof viewer.destroy === 'function') {
    try {
      viewer.destroy();
    } catch (err) {
      console.warn('销毁BPMN实例失败:', err);
    }
  }
}

// 获取当前激活的 viewer
export function getActiveViewer() {
  if (globalState.currentPageType === 'detail' && bpmnInstances.historyViewer) {
    return bpmnInstances.historyViewer;
  }
  return bpmnInstances.newViewer;
}

// 刷新属性面板
export function refreshPropertiesPanel() {
  const propPanelContainer = document.getElementById('properties-panel');
  const activeViewer = getActiveViewer();
  const propPanel = activeViewer ? activeViewer.get('propertiesPanel') : null;

  if (!propPanelContainer || !propPanel || !activeViewer) return;

  propPanelContainer.innerHTML = '';
  const canvas = activeViewer.get('canvas');
  const selection = canvas.getSelection();

  if (selection && selection.length > 0) {
    propPanel.attachTo(propPanelContainer);
  } else {
    const rootElement = canvas.getRootElement();
    if (rootElement) {
      propPanel.attachTo(propPanelContainer, rootElement);
    }
  }
}

// 自适应画布
export function fitCanvas() {
  const viewer = getActiveViewer();
  if (!viewer) return;
  const canvas = viewer.get('canvas');
  canvas.zoom('fit-viewport', 'auto');
}

// 缩放画布
function zoomCanvas(step) {
  const viewer = getActiveViewer();
  if (!viewer) return;
  const canvas = viewer.get('canvas');
  const currentZoom = canvas.zoom() || 1;
  const nextZoom = Math.max(0.2, Math.min(4, currentZoom + step));
  canvas.zoom(nextZoom);
}

// 放大
export function zoomInCanvas() {
  zoomCanvas(0.1);
}

// 缩小
export function zoomOutCanvas() {
  zoomCanvas(-0.1);
}

// 撤销
export function undoCanvas() {
  const viewer = getActiveViewer();
  if (!viewer) return;
  const commandStack = viewer.get('commandStack');
  if (commandStack.canUndo()) {
    commandStack.undo();
  }
}

// 重做
export function redoCanvas() {
  const viewer = getActiveViewer();
  if (!viewer) return;
  const commandStack = viewer.get('commandStack');
  if (commandStack.canRedo()) {
    commandStack.redo();
  }
}

// 初始化两个 BPMN 编辑器（新建 / 历史）
export function initBpmnViewers() {
  destroyBpmnViewer(bpmnInstances.newViewer);
  destroyBpmnViewer(bpmnInstances.historyViewer);

  const emptyXML = `<?xml version="1.0" encoding="UTF-8"?>
  <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="def">
    <bpmn:process id="proc" />
    <bpmndi:BPMNDiagram id="diag">
      <bpmndi:BPMNPlane id="plane" bpmnElement="proc" />
    </bpmndi:BPMNDiagram>
  </bpmn:definitions>`;

  // 新建流程画布
  const newContainer = document.getElementById('newBpmnContainer');
  if (newContainer) {
    bpmnInstances.newViewer = new BpmnModeler({
      container: newContainer,
      keyboard: { bindTo: document },
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule
      ],
      propertiesPanel: { parent: '#properties-panel' },
      moddleExtensions: { camunda: camundaModdleDesc }
    });

    bpmnInstances.newViewer.importXML(emptyXML).then(() => {
      const eventBus = bpmnInstances.newViewer.get('eventBus');
      eventBus.on('selection.changed', (event) => {
        if (globalState.currentPageType !== 'new') return;
        const selection = event.newSelection || [];
        const propPanel = bpmnInstances.newViewer.get('propertiesPanel');
        if (!propPanel) return;
        const container = document.getElementById('properties-panel');
        container.innerHTML = '';
        if (selection.length > 0) {
          propPanel.attachTo(container);
        } else {
          const rootElement = bpmnInstances.newViewer.get('canvas').getRootElement();
          if (rootElement) {
            propPanel.attachTo(container, rootElement);
          }
        }
      });
      fitCanvas();
    });
  }

  // 历史流程画布
  const historyContainer = document.getElementById('historyBpmnContainer');
  if (historyContainer) {
    bpmnInstances.historyViewer = new BpmnModeler({
      container: historyContainer,
      keyboard: { bindTo: document },
      additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule
      ],
      propertiesPanel: { parent: '#properties-panel' },
      moddleExtensions: { camunda: camundaModdleDesc }
    });

    bpmnInstances.historyViewer.importXML(emptyXML).then(() => {
      const eventBus = bpmnInstances.historyViewer.get('eventBus');
      eventBus.on('selection.changed', (event) => {
        if (globalState.currentPageType !== 'detail') return;
        const selection = event.newSelection || [];
        const propPanel = bpmnInstances.historyViewer.get('propertiesPanel');
        if (!propPanel) return;
        const container = document.getElementById('properties-panel');
        container.innerHTML = '';
        if (selection.length > 0) {
          propPanel.attachTo(container);
        } else {
          const rootElement = bpmnInstances.historyViewer.get('canvas').getRootElement();
          if (rootElement) {
            propPanel.attachTo(container, rootElement);
          }
        }
      });
      fitCanvas();
    });
  }
}