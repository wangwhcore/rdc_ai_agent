/**
 * 事件表达式工厂
 * 所有返回都是 JS 表达式字符串，用于 eventPayloadExpression
 */

function navigate(targetPageId, { type, query = '', data = null } = {}) {
  const payloadParts = [`url:'${targetPageId}'`];
  if (type) payloadParts.push(`type:'${type}'`);
  if (query) payloadParts.push(`query:'${query}'`);
  if (data) {
    payloadParts.push(`data:${data === 'rowData' ? 'eventPayload.rowData' : data}`);
  }
  return `pubsub.publish('@@navigator.push', { ${payloadParts.join(', ')} });`;
}

function openModal(listFrontId, modalId, { title = '$${button.delete}', width = 'small', type = 'delete', data = 'rowData' } = {}) {
  return `pubsub.publish('${listFrontId}.openM', { id: "${modalId}", title: "${title}", width: "${width}", type: "${type}", data: eventPayload.${data} });`;
}

function message(type, key) {
  return `pubsub.publish('@@message.${type}', '$${key}');`;
}

function formInit(frontId, dataExpr = 'eventPayload') {
  return `pubsub.publish('@@form.init', { id: '${frontId}', data: ${dataExpr} });`;
}

function formChange(field, valueExpr = 'eventPayload') {
  return `pubsub.publish('@@form.change', { name: '${field}', value: ${valueExpr} });`;
}

function apiRequest({ method, serverName, url, bodyExpression }) {
  return {
    type: 'request',
    dataSource: {
      type: 'api',
      method,
      serverName,
      url,
      bodyExpression,
    },
  };
}

function subscribe(event, pubs = [], behaviors = []) {
  return {
    event,
    pubs,
    ...(behaviors.length ? { behaviors } : {}),
  };
}

module.exports = {
  navigate,
  openModal,
  message,
  formInit,
  formChange,
  apiRequest,
  subscribe,
};
