jest.mock('../../src/services/auditLogService', () => ({
  logAction: jest.fn(),
}));

const mockCategoriesRepository = {
  findById: jest.fn(),
};

const mockDeactivateCategoryExecute = jest.fn();

jest.mock('../../src/modules/categories/infrastructure/sequelize/SequelizeCategoriesRepository', () => {
  return jest.fn().mockImplementation(() => mockCategoriesRepository);
});

jest.mock('../../src/modules/categories/application/use-cases/ListCategoriesUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/categories/application/use-cases/GetCategoryByIdUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/categories/application/use-cases/CreateCategoryUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/categories/application/use-cases/UpdateCategoryUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: jest.fn() }));
});
jest.mock('../../src/modules/categories/application/use-cases/DeactivateCategoryUseCase', () => {
  return jest.fn().mockImplementation(() => ({ execute: mockDeactivateCategoryExecute }));
});

import { logAction } from '../../src/services/auditLogService';
const categoryController = require('../../src/modules/categories/presentation/controllers/categoryController');

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('categoryController.remove com auditoria (CASE-014)', () => {
  beforeEach(() => {
    (logAction as jest.Mock).mockClear();
    mockCategoriesRepository.findById.mockReset();
    mockDeactivateCategoryExecute.mockReset();
  });

  it('audita a inativação de categoria com apenas active', async () => {
    const req: any = { params: { id: '9' } };
    const res = mockRes();
    const next = jest.fn();
    mockCategoriesRepository.findById.mockResolvedValueOnce({
      id: 9,
      name: 'Materiais',
      active: true,
    });
    mockDeactivateCategoryExecute.mockResolvedValueOnce({ message: 'Categoria inativada com sucesso' });

    await categoryController.remove(req, res, next);

    expect(logAction).toHaveBeenCalledWith(
      req,
      expect.objectContaining({
        action: 'soft_delete',
        entityType: 'Category',
        entityId: 9,
        entityDescription: 'Materiais',
        oldValues: { active: true },
        newValues: { active: false },
        description: 'Categoria Materiais inativada',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
