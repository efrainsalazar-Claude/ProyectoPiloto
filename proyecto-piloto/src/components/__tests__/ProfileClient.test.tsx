/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProfileClient from '../ProfileClient'

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.Mock

const MOCK_PROFILE = {
  name: 'Test User',
  email: 'test@example.com',
  image: null,
  role: 'Developer',
  company: 'SoftsVGroup',
  jobTitle: 'Engineer',
  department: 'Tech',
  updatedAt: '2026-05-29T00:00:00.000Z',
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('ProfileClient', () => {
  describe('Estado de carga', () => {
    it('muestra skeleton mientras fetch está pendiente', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      render(<ProfileClient />)
      const skeletons = document.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('no muestra el botón "Guardar cambios" durante la carga', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      render(<ProfileClient />)
      expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument()
    })
  })

  describe('Formulario cargado', () => {
    it('muestra los valores del perfil en los inputs', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_PROFILE })
      render(<ProfileClient />)
      await waitFor(() => {
        expect(screen.getByDisplayValue('Developer')).toBeInTheDocument()
        expect(screen.getByDisplayValue('SoftsVGroup')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Engineer')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Tech')).toBeInTheDocument()
      })
    })

    it('campos null del perfil se muestran como string vacío en los inputs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...MOCK_PROFILE, role: null, company: null, jobTitle: null, department: null }),
      })
      render(<ProfileClient />)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Developer, Manager/i)).toHaveValue('')
      })
    })

    it('muestra "Última actualización" cuando updatedAt tiene valor', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => MOCK_PROFILE })
      render(<ProfileClient />)
      await waitFor(() => {
        expect(screen.getByText(/Última actualización/i)).toBeInTheDocument()
      })
    })

    it('no muestra la fecha cuando updatedAt es null', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ...MOCK_PROFILE, updatedAt: null }) })
      render(<ProfileClient />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
      })
      expect(screen.queryByText(/Última actualización/i)).not.toBeInTheDocument()
    })
  })

  describe('Guardar cambios', () => {
    it('click en "Guardar cambios" dispara PATCH con los campos correctos', async () => {
      const patchResponse = { role: 'Developer', company: 'SoftsVGroup', jobTitle: 'Engineer', department: 'Tech', updatedAt: null }
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_PROFILE })
        .mockResolvedValueOnce({ ok: true, json: async () => patchResponse })

      render(<ProfileClient />)
      await waitFor(() => expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

      const [url, options] = mockFetch.mock.calls[1]
      expect(url).toBe('/api/profile')
      expect(options.method).toBe('PATCH')
      const body = JSON.parse(options.body)
      expect(body).toMatchObject({ role: 'Developer', company: 'SoftsVGroup', jobTitle: 'Engineer', department: 'Tech' })
    })

    it('muestra "Guardado" cuando el PATCH es exitoso', async () => {
      const patchResponse = { role: 'Lead', company: 'Acme', jobTitle: 'Dev', department: 'Tech', updatedAt: null }
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_PROFILE })
        .mockResolvedValueOnce({ ok: true, json: async () => patchResponse })

      render(<ProfileClient />)
      await waitFor(() => expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
      await waitFor(() => expect(screen.getByText('Guardado')).toBeInTheDocument())
    })

    it('muestra el mensaje de error cuando el PATCH falla', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => MOCK_PROFILE })
        .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Internal server error' }) })

      render(<ProfileClient />)
      await waitFor(() => expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
      await waitFor(() => expect(screen.getByText('Internal server error')).toBeInTheDocument())
    })
  })
})
