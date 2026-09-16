import { z } from 'zod';
import { shapes, relations } from './catalog.js';
export const id = z.string().min(1).max(128).regex(/^[A-Za-z_][\w.:-]*$/, 'Use a letter/underscore followed by letters, numbers, _, ., :, or -');
const label = z.string().max(20000);
const coord = z.number().finite().min(-1000000).max(1000000);
const size = z.number().finite().positive().max(100000);
export const nodeSchema = z.object({
  id, label: label.default(''), shape: z.enum(Object.keys(shapes)).default('process'),
  body: z.array(label).max(200).optional().describe('Rows beneath the title of a class or ER entity'),
  parent: id.optional().describe('Container node ID; child coordinates are relative to it'),
  x: coord.optional(), y: coord.optional(), width: size.optional(), height: size.optional(),
  style: z.string().max(20000).optional().describe('Raw draw.io style overrides; supports any installed stencil'),
}).strict();
export const point = z.object({ x: coord, y: coord });
export const edgeSchema = z.object({
  id: id.optional(), source: id, target: id, label: label.default(''),
  relation: z.enum(Object.keys(relations)).default('arrow'),
  style: z.string().max(20000).optional(), points: z.array(point).max(1000).optional(),
}).strict();
export const graphSchema = z.object({
  name: z.string().min(1).max(200).default('Diagram'),
  layout: z.enum(['LR','TB','RL','BT','manual']).default('LR'),
  nodes: z.array(nodeSchema).max(2000), edges: z.array(edgeSchema).max(4000).default([]),
}).strict();
export const xmlSchema = z.string().min(1).max(5_000_000);
