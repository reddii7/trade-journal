import { useState, useMemo } from 'react';
import {
  Box,
  Title,
  Group,
  Button,
  TextInput,
  Select,
  Table,
  Badge,
  ActionIcon,
  Tooltip,
  Text,
  Paper,
  Stack,
  MultiSelect,
  Pagination,
  Menu,
  Checkbox,
  ScrollArea,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
  IconPlus,
  IconUpload,
  IconSearch,
  IconPencil,
  IconTrash,
  IconDots,
  IconFilter,
  IconSortAscending,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { useTrades, deleteTrade } from '@/hooks/useTrades';
import { useTags } from '@/hooks/useJournals';
import { notifications } from '@mantine/notifications';
import TradeFormModal from '@/components/trades/TradeFormModal';
import CSVImportModal from '@/components/trades/CSVImportModal';
import type { TradeWithTags } from '@/types/database';

const PAGE_SIZE = 25;

type SortKey = 'entry_date' | 'symbol' | 'net_pnl' | 'r_multiple' | 'direction';

export default function TradeLog() {
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [csvOpened, { open: openCsv, close: closeCsv }] = useDisclosure(false);
  const [editTrade, setEditTrade] = useState<Partial<TradeWithTags> | undefined>(undefined);

  // Filters
  const [search, setSearch] = useState('');
  const [filterDirection, setFilterDirection] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>('CLOSED');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null] | [null, null]>([null, null]);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('entry_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { trades, loading, refetch } = useTrades({
    status: (filterStatus as 'OPEN' | 'CLOSED' | 'CANCELLED') || undefined,
    direction: (filterDirection as 'BUY' | 'SELL') || undefined,
    dateFrom: dateRange[0]?.toISOString(),
    dateTo: dateRange[1]?.toISOString(),
    tags: filterTags.length > 0 ? filterTags : undefined,
  });

  const { tags } = useTags();

  const filtered = useMemo(() => {
    let result = trades;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          (t.market_name || '').toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      let av: number | string | null = null;
      let bv: number | string | null = null;
      switch (sortKey) {
        case 'entry_date': av = a.entry_date || ''; bv = b.entry_date || ''; break;
        case 'symbol': av = a.symbol; bv = b.symbol; break;
        case 'net_pnl': av = a.net_pnl ?? 0; bv = b.net_pnl ?? 0; break;
        case 'r_multiple': av = a.r_multiple ?? 0; bv = b.r_multiple ?? 0; break;
        case 'direction': av = a.direction; bv = b.direction; break;
      }
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [trades, search, sortKey, sortAsc]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const handleDelete = async (id: string) => {
    try {
      await deleteTrade(id);
      notifications.show({ message: 'Trade deleted', color: 'orange' });
      refetch();
    } catch {
      notifications.show({ message: 'Delete failed', color: 'red' });
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const fmt = (v: number) => `£${Math.abs(v).toFixed(2)}`;

  return (
    <Box p="xl">
      <Group justify="space-between" mb="xl">
        <Title order={2}>Trade Log</Title>
        <Group>
          <Button
            leftSection={<IconUpload size={16} />}
            variant="light"
            onClick={openCsv}
          >
            Import CSV
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={openAdd}>
            Add Trade
          </Button>
        </Group>
      </Group>

      {/* Filters */}
      <Paper p="md" radius="md" withBorder mb="md">
        <Group gap="md" wrap="wrap">
          <TextInput
            placeholder="Search symbol, market..."
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select
            placeholder="Direction"
            data={[
              { value: '', label: 'All Directions' },
              { value: 'BUY', label: 'BUY' },
              { value: 'SELL', label: 'SELL' },
            ]}
            value={filterDirection}
            onChange={setFilterDirection}
            clearable
            w={140}
          />
          <Select
            placeholder="Status"
            data={[
              { value: '', label: 'All Status' },
              { value: 'OPEN', label: 'Open' },
              { value: 'CLOSED', label: 'Closed' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ]}
            value={filterStatus}
            onChange={setFilterStatus}
            clearable
            w={130}
          />
          <DatePickerInput
            type="range"
            placeholder="Date range"
            value={dateRange}
            onChange={(v) => setDateRange(v as [Date | null, Date | null])}
            clearable
            w={220}
          />
          <MultiSelect
            placeholder="Filter by tags"
            data={tags.map((t) => ({ value: t.id, label: t.name }))}
            value={filterTags}
            onChange={setFilterTags}
            leftSection={<IconFilter size={14} />}
            clearable
            w={200}
          />
        </Group>
      </Paper>

      {/* Summary strip */}
      <Group mb="sm" gap="xl">
        <Text size="sm" c="dimmed">
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </Text>
        <Text size="sm" c="dimmed">
          Total P&L:{' '}
          <Text
            component="span"
            c={filtered.reduce((s, t) => s + (t.net_pnl ?? 0), 0) >= 0 ? 'teal' : 'red'}
            fw={600}
          >
            {filtered.reduce((s, t) => s + (t.net_pnl ?? 0), 0) >= 0 ? '+' : ''}
            {fmt(filtered.reduce((s, t) => s + (t.net_pnl ?? 0), 0))}
          </Text>
        </Text>
        {selectedIds.length > 0 && (
          <Badge color="blue">{selectedIds.length} selected</Badge>
        )}
      </Group>

      {/* Table */}
      <Paper radius="md" withBorder>
        <ScrollArea>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40}>
                  <Checkbox
                    checked={selectedIds.length === paged.length && paged.length > 0}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? paged.map((t) => t.id) : [])
                    }
                  />
                </Table.Th>
                <Table.Th
                  onClick={() => toggleSort('entry_date')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <Group gap={4}>
                    Date
                    {sortKey === 'entry_date' && <IconSortAscending size={12} style={{ transform: sortAsc ? 'none' : 'scaleY(-1)' }} />}
                  </Group>
                </Table.Th>
                <Table.Th onClick={() => toggleSort('symbol')} style={{ cursor: 'pointer' }}>Symbol</Table.Th>
                <Table.Th>Direction</Table.Th>
                <Table.Th>Entry</Table.Th>
                <Table.Th>Exit</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th onClick={() => toggleSort('net_pnl')} style={{ cursor: 'pointer' }}>P&L</Table.Th>
                <Table.Th onClick={() => toggleSort('r_multiple')} style={{ cursor: 'pointer' }}>R</Table.Th>
                <Table.Th>Tags</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th w={60} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Text ta="center" c="dimmed" py="xl">Loading trades...</Text>
                  </Table.Td>
                </Table.Tr>
              ) : paged.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={12}>
                    <Stack align="center" py="xl">
                      <Text c="dimmed">No trades found.</Text>
                      <Text size="sm" c="dimmed">Import a CSV or add trades manually.</Text>
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              ) : (
                paged.map((trade) => (
                  <Table.Tr
                    key={trade.id}
                    style={{ opacity: trade.status === 'CANCELLED' ? 0.5 : 1 }}
                  >
                    <Table.Td>
                      <Checkbox
                        checked={selectedIds.includes(trade.id)}
                        onChange={() => toggleSelect(trade.id)}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text size="sm" fw={500}>
                          {trade.entry_date
                            ? format(new Date(trade.entry_date), 'dd MMM yy')
                            : '—'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {trade.entry_date
                            ? format(new Date(trade.entry_date), 'HH:mm')
                            : ''}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={600} size="sm">{trade.symbol}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        color={trade.direction === 'BUY' ? 'teal' : 'red'}
                        variant="light"
                      >
                        {trade.direction}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{trade.entry_price?.toFixed(2) ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{trade.exit_price?.toFixed(2) ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{trade.position_size ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text
                        fw={700}
                        size="sm"
                        c={(trade.net_pnl ?? 0) >= 0 ? 'teal' : 'red'}
                      >
                        {(trade.net_pnl ?? 0) >= 0 ? '+' : ''}
                        £{(trade.net_pnl ?? 0).toFixed(2)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {trade.r_multiple != null ? (
                        <Badge
                          size="sm"
                          color={trade.r_multiple >= 0 ? 'blue' : 'orange'}
                          variant="light"
                        >
                          {trade.r_multiple >= 0 ? '+' : ''}{trade.r_multiple.toFixed(1)}R
                        </Badge>
                      ) : '—'}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {(trade.tags || []).slice(0, 2).map((tag) => (
                          <Badge
                            key={tag.id}
                            size="xs"
                            style={{ backgroundColor: tag.color + '30', color: tag.color }}
                          >
                            {tag.name}
                          </Badge>
                        ))}
                        {(trade.tags || []).length > 2 && (
                          <Badge size="xs" color="gray">+{(trade.tags || []).length - 2}</Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" color="gray" variant="outline">
                        {trade.imported_from}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Menu shadow="md" position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" size="sm">
                            <IconDots size={14} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconPencil size={14} />}
                            onClick={() => {
                              setEditTrade(trade);
                              openAdd();
                            }}
                          >
                            Edit
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => handleDelete(trade.id)}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        {totalPages > 1 && (
          <Group justify="center" p="md">
            <Pagination
              value={page}
              onChange={setPage}
              total={totalPages}
              size="sm"
            />
          </Group>
        )}
      </Paper>

      <TradeFormModal
        opened={addOpened}
        onClose={() => { closeAdd(); setEditTrade(undefined); }}
        trade={editTrade}
        onSaved={refetch}
      />
      <CSVImportModal
        opened={csvOpened}
        onClose={closeCsv}
        onImported={refetch}
      />
    </Box>
  );
}
