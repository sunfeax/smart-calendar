import { Observable } from 'rxjs';

export type UndoStep = () => Observable<unknown>;
