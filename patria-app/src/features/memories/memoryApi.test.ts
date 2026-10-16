import { Image } from 'expo-image';

import { supabase } from '../../lib/supabase';
import {
  clearImageCacheIfItemsLost,
  deleteMemoryItem,
  MEMORIES_BUCKET,
} from './memoryApi';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
    from: jest.fn(),
  },
}));

describe('memory delete and cache', () => {
  it('deletes both files through Storage then the row', async () => {
    const remove = jest.fn(async () => ({ error: null }));
    const del = jest.fn(() => Promise.resolve({ error: null }));
    (supabase.storage.from as jest.Mock).mockReturnValue({ remove });
    (supabase.from as jest.Mock).mockReturnValue({
      delete: () => ({ eq: del }),
    });
    await deleteMemoryItem({
      id: 'item-1',
      fullPath: 'space/item-1/full.jpg',
      thumbPath: 'space/item-1/thumb.jpg',
    });
    expect(supabase.storage.from).toHaveBeenCalledWith(MEMORIES_BUCKET);
    expect(remove).toHaveBeenCalledWith(['space/item-1/full.jpg', 'space/item-1/thumb.jpg']);
    expect(del).toHaveBeenCalledWith('id', 'item-1');
  });

  it('clears the image cache when a previously visible item disappears', async () => {
    const memory = Image.clearMemoryCache as jest.Mock;
    const disk = Image.clearDiskCache as jest.Mock;
    memory.mockClear();
    disk.mockClear();
    await clearImageCacheIfItemsLost(['a', 'b'], ['a', 'b']);
    expect(memory).not.toHaveBeenCalled();
    await clearImageCacheIfItemsLost(['a', 'b'], ['a']);
    expect(memory).toHaveBeenCalled();
    expect(disk).toHaveBeenCalled();
  });
});
