jest.mock('../../src/services/auditLogService', () => ({
  logAction: jest.fn(),
}));

const mockItemRepository = {};
const mockItemEstruturaRepository = {};
const mockItemSupplierRepository = {
  findById: jest.fn(),
};

const mockDeactivateItemSupplierExecute = jest.fn();

jest.mock('../../src/modules/items/infrastructure/sequelize/SequelizeItemRepository', () => {
  return jest.fn().mockImplementation(() => mockItemRepository);
});

jest.mock('../../src/modules/items/infrastructure/sequelize/SequelizeItemEstruturaRepository', () => {
  return jest.fn().mockImplementation(() => mockItemEstruturaRepository);
});

jest.mock('../../src/modules/items/infrastructure/sequelize/SequelizeItemSupplierRepository', () => {
  return jest.fn().mockImplementation(() => mockItemSupplierRepository);
});

jest.mock('../../src/modules/items/application/use-cases/CreateItemUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/UpdateItemUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/CreateItemStructureUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/ExplodeItemStructureUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/DeactivateItemUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/ListItemSuppliersUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/CreateItemSupplierUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/UpdateItemSupplierUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/items/application/use-cases/DeactivateItemSupplierUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: mockDeactivateItemSupplierExecute }));
});
jest.mock('../../src/modules/items/application/use-cases/GetItemPurchaseHistoryUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});

import { logAction } from '../../src/services/auditLogService';
const itemController = require('../../src/modules/items/presentation/controllers/itemController');

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('itemController.removeSupplier com auditoria (CASE-014)', () => {
  beforeEach(() => {
    (logAction as jest.Mock).mockClear();
    mockItemSupplierRepository.findById.mockReset();
    mockDeactivateItemSupplierExecute.mockReset();
  });

  it('audita a desativação do vínculo item-fornecedor com apenas active/preferred', async () => {
    const req: any = { params: { id: '5', linkId: '77' } };
    const res = mockRes();
    const next = jest.fn();
    mockItemSupplierRepository.findById.mockResolvedValueOnce({
      id: 77,
      item_id: '550e8400-e29b-41d4-a716-446655440000',
      supplier_id: 13,
      unit_price: 10.5,
      moq: 20,
      notes: 'observar',
      active: true,
      preferred: true,
    });
    mockDeactivateItemSupplierExecute.mockResolvedValueOnce({
      id: 77,
      active: false,
      preferred: false,
    });

    await itemController.removeSupplier(req, res, next);

    expect(mockItemSupplierRepository.findById).toHaveBeenCalledWith(77);
    expect(logAction).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        action: 'soft_delete',
        entityType: 'ItemSupplier',
        entityId: 77,
        entityDescription: 'item 550e8400-e29b-41d4-a716-446655440000 x fornecedor 13',
        oldValues: { active: true, preferred: true },
        newValues: { active: false, preferred: false },
        description: 'Vínculo item-fornecedor #77 desativado',
      }),
    );
    const [, payload] = (logAction as jest.Mock).mock.calls[0];
    expect(payload.oldValues).not.toHaveProperty('unit_price');
    expect(payload.oldValues).not.toHaveProperty('moq');
    expect(payload.oldValues).not.toHaveProperty('notes');
    expect(payload.newValues).not.toHaveProperty('unit_price');
    expect(payload.newValues).not.toHaveProperty('moq');
    expect(payload.newValues).not.toHaveProperty('notes');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 77, active: false, preferred: false } });
    expect(next).not.toHaveBeenCalled();
  });
});
