// Both surfaces use the existing reducer and domain source. No Desktop policy fork.
export * from '../src/state';
export * from '../src/domain/catalog';
export * from '../src/domain/knowledge';
export * from '../src/domain/history';
import { createInitialState, reducer } from '../src/state';
import { parseKnowledgeFile } from '../src/domain/knowledge';
import { parseHistoryFile } from '../src/domain/history';
import knowledge from '../fixtures/knowledge-demo.json';
import history from '../fixtures/customer-history-demo.json';

export function createDesktopState() {
  let state = createInitialState();
  state = reducer(state, {type:'IMPORT_KNOWLEDGE', entries:parseKnowledgeFile(
    JSON.stringify(knowledge),'knowledge-demo.json',state.knowledge.length,7), epoch:state.knowledgeImportEpoch});
  state = reducer(state, {type:'IMPORT_HISTORY', history:parseHistoryFile(JSON.stringify(history)), epoch:state.historyImportEpoch});
  return reducer(state, {type:'EXTRACT_FACTS'});
}
