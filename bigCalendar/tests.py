from django.test import SimpleTestCase
from django.urls import reverse


class CalendarViewTest(SimpleTestCase):
    def test_index_returns_200(self):
        response = self.client.get(reverse('calendar_index'))
        self.assertEqual(response.status_code, 200)

    def test_index_uses_correct_template(self):
        response = self.client.get(reverse('calendar_index'))
        self.assertTemplateUsed(response, 'bigCalendar/index.html')

    def test_canvas_element_present(self):
        response = self.client.get(reverse('calendar_index'))
        self.assertContains(response, '<canvas id="canvas">')

    def test_js_constants(self):
        response = self.client.get(reverse('calendar_index'))
        content = response.content.decode()
        self.assertIn('NUM_ROOMS   = 500', content)
        self.assertIn('BUFFER_DAYS = 30', content)
        self.assertIn('CELL_W      = 80', content)

    def test_virtual_window_functions_present(self):
        response = self.client.get(reverse('calendar_index'))
        content = response.content.decode()
        self.assertIn('shiftWindowRight', content)
        self.assertIn('shiftWindowLeft', content)
        self.assertIn('checkWindowBounds', content)
        self.assertIn('buildInitialWindow', content)
