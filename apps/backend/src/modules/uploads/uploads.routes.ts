import { Router } from 'express';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { consume } from '../../middleware/rate-limit';
import { authorize, tenantOf } from '../../middleware/tenant';
import { receiveUpload, uploadDto } from './uploads.service';

export function uploadsRouter() {
  const r = Router();
  r.post('/uploads', requireSession, authorize('uploads.create'), async (req, res) => {
    const teamId = tenantOf(req).team._id;
    await consume('uploads', teamId);
    res.status(201).json(uploadDto(await receiveUpload(req, teamId, sessionUser(req).user._id)));
  });
  return r;
}
